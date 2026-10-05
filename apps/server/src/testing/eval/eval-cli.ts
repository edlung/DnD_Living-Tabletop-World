import { writeFile } from 'node:fs/promises';

import { InMemoryAiTraceStore } from '@ltw/ai';
import type {
  AiTraceView,
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import { InMemoryEventStore } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import { costUsd } from '../../ai/budget.ts';
import { createAiGateway } from '../../ai/gateway.ts';
import { loadConfig } from '../../platform/config/config.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../../world-engine/ravenford-seed.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  plantNpcBoundary,
  post,
  ravenfordApp,
  seededEngine,
  testAuthoring,
} from '../ravenford-app.ts';
import { DIALOGUE_SCENARIOS, INTENT_CASES, NEVER_SAID } from './cases.ts';

/**
 * `pnpm eval:ai`: runs the Russian evaluation cases against live providers and writes
 * `reports/evidence/stage-300/` (docs/adr/0032-live-ai.md §5). Not part of validation: it spends money.
 * The route under test has no local fallback, so a failure shows as a failure.
 */
const BASE = '/campaigns/ravenford';
const CYRILLIC = /[Ѐ-ӿ]/u;
const MODELS = {
  reasoning: [
    'anthropic:claude-opus-5-5',
    'anthropic:claude-sonnet-5-5',
    'deepseek:deepseek-flash',
  ],
  'npc-dialogue': ['anthropic:claude-sonnet-5-5', 'deepseek:deepseek-flash'],
  narrative: [
    'anthropic:claude-opus-5-5',
    'anthropic:claude-sonnet-5-5',
    'deepseek:deepseek-flash',
  ],
  'fast-context': ['deepseek:deepseek-flash', 'anthropic:claude-haiku-4-5'],
} as const;
type Capability = keyof typeof MODELS;

async function world(capability: Capability, spec: string) {
  const traces = new InMemoryAiTraceStore();
  const config = loadConfig({
    ...process.env,
    LTW_AI_ROUTES: `${capability}=${spec}`,
    LTW_AI_DAILY_BUDGET_USD: process.env['LTW_AI_DAILY_BUDGET_USD'] ?? '20',
  });
  const ai = createAiGateway(config.ai, traces);
  const engine = await seededEngine(
    new InMemoryEventStore(),
    scriptedDice(Array(40).fill(15)),
    MIDDLE_ENTROPY,
    RAVENFORD_RU_FIXTURES_DIR,
  );
  await plantNpcBoundary(engine);
  const app = await ravenfordApp(engine, ai, testAuthoring());
  return { app, engine, ai, traces };
}

interface Row {
  readonly model: string;
  readonly case: string;
  readonly pass: boolean;
  readonly note: string;
  readonly reply?: string;
}
interface Stats {
  readonly calls: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly inTokens: number;
  readonly outTokens: number;
  readonly costUsd: number;
}

function stats(traces: readonly AiTraceView[], model: string): Stats {
  const attempts = traces.flatMap((t) => ('attempts' in t ? t.attempts : []));
  const ms = attempts.map((a) => a.latencyMs).sort((a, b) => a - b);
  const at = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] ?? 0;
  const inT = attempts.reduce((s, a) => s + (a.usage?.inputTokens ?? 0), 0);
  const outT = attempts.reduce((s, a) => s + (a.usage?.outputTokens ?? 0), 0);
  return {
    calls: attempts.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    inTokens: inT,
    outTokens: outT,
    costUsd: costUsd(model.split(':')[1] ?? '', inT, outT),
  };
}

async function intents(spec: string): Promise<{ rows: Row[]; stats: Stats }> {
  const { app, traces } = await world('reasoning', spec);
  const rows: Row[] = [];
  for (const c of INTENT_CASES) {
    const res = await post(app, `${BASE}/ai/intents`, { text: c.text }, TOKENS.dm);
    const body = res.json<DmIntentResponse>();
    const commands = (body.proposal?.commands ?? []) as unknown as Record<string, unknown>[];
    // The contract wants at least one command, so a model that rightly proposes nothing for a
    // non-game request is refused as invalid output: the DM is told it could not be turned into a proposal.
    const refusedEmpty =
      c.expectEmpty === true &&
      body.status === 'INVALID_OUTPUT' &&
      body.issues.some((issue) => issue.includes('>=1'));
    let pass = refusedEmpty || (body.status === 'PROPOSED' && c.ok(commands));
    let note =
      body.status === 'PROPOSED'
        ? `${String(commands.length)} commands`
        : `${body.status}: ${body.issues.join('; ').slice(0, 120)}`;
    if (c.mustNotCommit && body.status === 'PROPOSED') {
      const proposed = await post(
        app,
        `${BASE}/authoring/proposals`,
        { traceId: body.traceId },
        TOKENS.dm,
      );
      const preview = proposed.json<{ preview?: { committable?: boolean } | null }>().preview;
      pass = commands.length === 0 || preview?.committable === false || proposed.statusCode >= 400;
      note += `; preview committable=${String(preview?.committable)}`;
    } else if (c.mustNotCommit)
      pass = body.status === 'PROPOSED' || body.status === 'INVALID_OUTPUT';
    rows.push({ model: spec, case: c.name, pass, note });
  }
  return { rows, stats: stats(traces.all(), spec) };
}

async function dialogue(spec: string): Promise<{ rows: Row[]; stats: Stats }> {
  const { app, engine, traces } = await world('npc-dialogue', spec);
  const rows: Row[] = [];
  const places = {
    'mira-vale': 'market-square',
    'orin-stonebeard': 'orins-alchemy',
    'captain-thorne': 'north-gate',
  } as const;
  let n = 0;
  const dm = { actorId: 'dm-ravenford', kind: 'user' } as const;
  for (const [npc, place] of Object.entries(places)) {
    n += 1;
    await engine.execute({
      commandId: `ev.${String(n)}`,
      campaignId: 'ravenford',
      actor: dm,
      command: { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: place },
    });
    const never = [...NEVER_SAID['*'], ...NEVER_SAID[npc as keyof typeof NEVER_SAID]];
    for (const s of DIALOGUE_SCENARIOS) {
      const res = await post(
        app,
        `${BASE}/npcs/${npc}/dialogue`,
        {
          characterId: 'elowen-starwhisper',
          intent: s.intent,
          ...(s.line ? { line: s.line } : {}),
        },
        TOKENS.player,
      );
      const reply = res.json<NpcDialogueResponse>().reply;
      const text = reply?.text ?? '';
      const leaks = never.filter((m) => text.includes(m));
      const pass =
        reply?.status === 'REPLIED' &&
        CYRILLIC.test(text) &&
        text.length <= 600 &&
        leaks.length === 0;
      rows.push({
        model: spec,
        case: `${npc}: ${s.name}`,
        pass,
        note: leaks.length
          ? `LEAK ${leaks.join(',')}`
          : (reply?.status ?? `HTTP ${String(res.statusCode)}`),
        reply: text,
      });
    }
  }
  return { rows, stats: stats(traces.all(), spec) };
}

async function chronicle(spec: string): Promise<{ rows: Row[]; stats: Stats }> {
  const { app, traces } = await world('narrative', spec);
  const res = await post(
    app,
    `${BASE}/chronicle`,
    { title: 'Глава I — Тени на Торговой дороге', perspective: 'PARTY', from: 0 },
    TOKENS.dm,
  );
  const body = res.json<GenerateChronicleResponse>();
  const listed = await get(app, `${BASE}/chronicle?perspective=PARTY`, TOKENS.player);
  const chapters = listed.json<{
    chapters: { prose: { paragraphs: { text: string }[] } }[];
  }>().chapters;
  const prose = JSON.stringify(listed.json());
  const text = (chapters[0]?.prose.paragraphs ?? []).map((p) => p.text).join('\n\n');

  return {
    rows: [
      {
        model: spec,
        case: 'Chapter I from the party memories',
        pass:
          body.rendering.status === 'RENDERED' &&
          body.rendering.provider !== 'local' &&
          CYRILLIC.test(prose),
        note: `${body.rendering.status} via ${body.rendering.provider ?? '-'}`,
        reply: text,
      },
    ],
    stats: stats(traces.all(), spec),
  };
}

async function relevance(spec: string): Promise<{ rows: Row[]; stats: Stats }> {
  const { app, engine, traces } = await world('fast-context', spec);
  await engine.execute({
    commandId: 'ev.r',
    campaignId: 'ravenford',
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    command: {
      type: 'EnterLocation',
      characterId: 'elowen-starwhisper',
      locationId: 'market-square',
    },
  });
  const started = Date.now();
  const res = await get(
    app,
    `${BASE}/entities/mira-vale/context?perspective=PLAYER&ranking=ai`,
    TOKENS.player,
  );
  const ranking = res.json<EntityContextResponse>().ranking;
  return {
    rows: [
      {
        model: spec,
        case: 'rank Mira’s actions',
        pass: ranking.source === 'ai',
        note: `${ranking.status}, ${String(Date.now() - started)} ms (budget 2000)`,
      },
    ],
    stats: stats(traces.all(), spec),
  };
}

const RUNNERS = {
  reasoning: intents,
  'npc-dialogue': dialogue,
  narrative: chronicle,
  'fast-context': relevance,
} as const;

async function main(): Promise<void> {
  const only = process.argv[2] as Capability | undefined;
  const report: Record<string, unknown> = { date: new Date().toISOString(), capabilities: {} };
  const md: string[] = [
    '# Stage 300 — live AI evaluation (Russian)',
    '',
    `Run: ${String(report['date'])}`,
    '',
  ];
  const blind: { npc: string; case: string; replies: Record<string, string> }[] = [];
  for (const capability of Object.keys(MODELS) as Capability[]) {
    if (only && only !== capability) continue;
    md.push(
      `## ${capability}`,
      '',
      '| model | pass | calls | p50 ms | p95 ms | in tok | out tok | cost $ |',
      '|---|---|---|---|---|---|---|---|',
    );
    const results: Record<string, unknown> = {};
    for (const spec of MODELS[capability]) {
      console.log(`${capability} ${spec} …`);
      try {
        const { rows, stats: s } = await RUNNERS[capability](spec);
        results[spec] = { rows, stats: s };
        md.push(
          `| ${spec} | ${String(rows.filter((r) => r.pass).length)}/${String(rows.length)} | ${String(s.calls)} | ${String(s.p50Ms)} | ${String(s.p95Ms)} | ${String(s.inTokens)} | ${String(s.outTokens)} | ${s.costUsd.toFixed(4)} |`,
        );
        for (const r of rows.filter((x) => !x.pass))
          md.push(`|  ↳ FAIL ${r.case} | ${r.note.replaceAll('|', '/')} | | | | | | |`);
        if (capability === 'npc-dialogue')
          for (const r of rows) {
            const [npc = '', ...rest] = r.case.split(': ');
            const found = blind.find((b) => b.npc === npc && b.case === rest.join(': '));
            const item = found ?? { npc, case: rest.join(': '), replies: {} };
            if (!found) blind.push(item);
            item.replies[spec] = r.reply ?? '';
          }
      } catch (error) {
        results[spec] = { error: String(error) };
        md.push(`| ${spec} | ERROR | | | | | | ${String(error).slice(0, 80)} |`);
      }
    }
    (report['capabilities'] as Record<string, unknown>)[capability] = results;
    md.push('');
  }
  const chapters = Object.entries(
    (report['capabilities'] as Record<string, Record<string, { rows?: Row[] }>>)['narrative'] ?? {},
  );
  const dir = new URL('../../../../../reports/evidence/stage-300/', import.meta.url).pathname;
  await writeFile(`${dir}eval-results.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${dir}eval-report.md`, `${md.join('\n')}\n`);
  if (chapters.length > 0) {
    const lines = ['# Глава I: три модели (Stage 300)', ''];
    for (const [spec, result] of chapters)
      lines.push(`## ${spec}`, '', result.rows?.[0]?.reply ?? '(нет)', '');
    await writeFile(`${dir}chronicle-compare.md`, `${lines.join('\n')}\n`);
  }
  if (blind.length > 0) {
    const key: Record<string, string> = {};
    const lines = [
      '# Слепое сравнение реплик NPC (Stage 300)',
      '',
      'Для каждого случая два ответа, A и B. Отметьте, какой лучше держит голос персонажа и не выдумывает. Ключ — в `blind-key.json`; не открывайте его до выбора.',
      '',
    ];
    blind.forEach((item, index) => {
      const specs = Object.keys(item.replies);
      const flip = index % 2 === 1;
      const [a, b] = flip ? [specs[1], specs[0]] : [specs[0], specs[1]];
      key[String(index + 1)] = `A=${a ?? ''}; B=${b ?? ''}`;
      lines.push(
        `## ${String(index + 1)}. ${item.npc} — ${item.case}`,
        '',
        `**A:** ${item.replies[a ?? ''] ?? '(нет)'}`,
        '',
        `**B:** ${item.replies[b ?? ''] ?? '(нет)'}`,
        '',
      );
    });
    await writeFile(`${dir}blind-npc-dialogue.md`, `${lines.join('\n')}\n`);
    await writeFile(`${dir}blind-key.json`, `${JSON.stringify(key, null, 2)}\n`);
  }
  console.log(md.join('\n'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
