import { appendFile, readFile } from 'node:fs/promises';

import { createAnthropicProvider } from '../../apps/server/src/ai/anthropic-provider.ts';
import { CLAUDE_SONNET_5_5 } from '../../apps/server/src/ai/catalog-sonnet-5-5.ts';
import { priceUsage } from '../../apps/server/src/ai/pricing.ts';
import { streamMessage } from './sonnet-stream.ts';

/**
 * Campaign authoring through Sonnet 5.5 on the project's own Anthropic adapter (owner decision of
 * 2026-11-13: Sonnet 5.5 writes campaign chapters over the API, ceiling per campaign). One job is
 * one structured-output request, prepared by the project's adapter and sent as a stream
 * (`sonnet-stream.ts`); the answer is the tool input. Effort `high` is sent explicitly
 * (owner's choice; the verified catalog lists only low and medium for runtime capabilities, prices
 * are the same). Every
 * response is priced with the catalog's own rates and appended to a ledger before its output is
 * used; a job is refused when the ledger plus the job's worst case would pass the ceiling, and no
 * job starts once the ledger reaches the stop line. The key comes only from the process
 * environment and is never printed.
 */
export interface AuthorJob {
  readonly campaign: string;
  readonly name: string;
  readonly system: string;
  readonly prompt: string;
  readonly toolName: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface Budget {
  readonly ledger: string;
  readonly ceilingUsd: number;
  readonly stopUsd: number;
  readonly maxTokens: number;
}

interface LedgerRow {
  readonly at: string;
  readonly campaign: string;
  readonly job: string;
  readonly kind: string;
  readonly requestId: string | null;
  readonly model: string | null;
  readonly micros: string | null;
  readonly usage: Readonly<Record<string, number>> | null;
  readonly seconds: number;
}

const MODEL = 'claude-sonnet-5-5';
type Payload = Parameters<ReturnType<typeof createAnthropicProvider>['prepare']>[0];
/** Input priced at the highest input rate (cache write, 2.5 µ$) from a generous token estimate. */
const worstCaseMicros = (job: AuthorJob, maxTokens: number): number =>
  Math.ceil(
    ((job.system.length + job.prompt.length + JSON.stringify(job.schema).length) / 2) * 2.5,
  ) +
  maxTokens * 10;

export async function spentMicros(ledger: string, campaign?: string): Promise<number> {
  let text: string;
  try {
    text = await readFile(ledger, 'utf8');
  } catch {
    return 0;
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerRow)
    .filter((row) => campaign === undefined || row.campaign === campaign)
    .reduce((sum, row) => sum + Number(row.micros ?? 0), 0);
}

export async function runJob(job: AuthorJob, budget: Budget): Promise<unknown> {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in this process');
  const spent = await spentMicros(budget.ledger, job.campaign);
  if (spent >= budget.stopUsd * 1e6) {
    throw new Error(`stop line reached: $${(spent / 1e6).toFixed(2)} spent on ${job.campaign}`);
  }
  const worst = worstCaseMicros(job, budget.maxTokens);
  if (spent + worst > budget.ceilingUsd * 1e6) {
    throw new Error(`${job.name}: worst case $${(worst / 1e6).toFixed(2)} would pass the ceiling`);
  }
  const provider = createAnthropicProvider({
    apiKey: () => key,
    model: MODEL,
    timeoutMs: 900_000,
    effort: 'high',
    maxTokens: budget.maxTokens,
    cache: '5m',
  });
  const payload = {
    capability: 'campaign-preparation',
    system: job.system,
    prompt: job.prompt,
    output: { name: job.toolName, description: `Write ${job.name} as JSON.`, schema: job.schema },
    task: { kind: 'campaign-preparation' },
  } as unknown as Payload;
  const prepared = provider.prepare(payload);
  const started = performance.now();
  let response: Awaited<ReturnType<typeof streamMessage>>;
  try {
    response = await streamMessage(prepared.body, key, MODEL, job.toolName, 900_000);
  } catch (error) {
    // After the start boundary the charge is unknown: book the worst case, never zero.
    const code = (error as { code?: string }).code ?? 'ERROR';
    await appendFile(
      budget.ledger,
      `${JSON.stringify({ at: new Date().toISOString(), campaign: job.campaign, job: job.name, kind: `error:${code}`, requestId: null, model: null, micros: String(worst), usage: null, seconds: Math.round((performance.now() - started) / 1000) })}\n`,
    );
    throw error;
  }
  const seconds = Math.round((performance.now() - started) / 1000);
  const priced = priceUsage(CLAUDE_SONNET_5_5, response);
  const row: LedgerRow = {
    at: new Date().toISOString(),
    campaign: job.campaign,
    job: job.name,
    kind: response.kind === 'output' ? 'output' : `${response.kind}:${response.code ?? ''}`,
    requestId: response.providerRequestId,
    model: response.model,
    // An unpriced response is booked at its worst case, never as free.
    micros: priced.kind === 'known' ? priced.micros.toString() : String(worst),
    usage: priced.kind === 'known' ? priced.usage : null,
    seconds,
  };
  await appendFile(budget.ledger, `${JSON.stringify(row)}\n`);
  if (response.kind !== 'output') throw new Error(`${job.name}: ${row.kind}`);
  return response.output;
}
