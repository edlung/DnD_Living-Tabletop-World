import type pg from 'pg';

import { AccountingTasks } from '../../ai/accounting-tasks.ts';
import { VERIFIED_CATALOG, configuredEntry } from '../../ai/catalog.ts';
import { loadConfig, type Env } from '../../platform/config/config.ts';
import { parseEvalArgs, DEFAULT_EVAL_MODEL } from './eval-args.ts';
import { EVAL_CAMPAIGN, liveGateway, preflight, type LiveBinding } from './eval-live.ts';
import {
  BLIND_COMPARISON,
  caseInventory,
  configurationRecord,
  gitSourceState,
  type SourceState,
} from './eval-manifest.ts';
import { createRunDirectory, newRunId } from './eval-output.ts';
import {
  capabilityMarkdown,
  headerMarkdown,
  runCharges,
  summarize,
  usageSamples,
} from './eval-report.ts';
import { CAPABILITIES, type Capability, type CapabilityResult } from './eval-rows.ts';
import { RUNNERS } from './eval-runners.ts';
import { liveContext, offlineContext, offlineEnv, type EvalContext } from './eval-world.ts';
import { estimateMarkdown, sessionEstimate } from './session-estimate.ts';

export { parseEvalArgs } from './eval-args.ts';

/**
 * `pnpm eval:ai` (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint C).
 *
 * - `--offline`: the deterministic local providers, into a fresh immutable directory, labelled
 *   offline; never a live measurement.
 * - `--live --approval <id> --run <id>`: refused unless the model has a verified catalog entry,
 *   the database is configured and reachable, the provider has a key, the approval is stored and
 *   the run is registered to that approval and the evaluation campaign (`eval-live.ts`). Every
 *   attempt is then admitted against the approval's ceilings and charged to the run.
 *
 * Each run writes a new directory (never overwriting): `manifest.json` (source commit and dirty
 * hashes, configuration without keys, model identity, case inventory, known missing charges,
 * summaries), `eval-results.json` and `eval-report.md` (separated verdicts, latencies, the session
 * estimate). No blind artifact is written: the owner waived the blind comparison.
 */
export interface EvalDeps {
  readonly env: Env;
  readonly log: (line: string) => void;
  readonly now: () => Date;
  readonly runners?: Readonly<
    Record<Capability, (context: EvalContext) => Promise<CapabilityResult>>
  >;
  /** Live only: the provider transport (the CLI's global `fetch`; tests a fake). */
  readonly transport?: typeof fetch | undefined;
  readonly connect?: (url: string) => pg.Pool;
  readonly source?: () => Promise<SourceState>;
}

const json = (value: unknown) =>
  `${JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`;

/** Returns the process exit code. */
export async function runEval(argv: readonly string[], deps: EvalDeps): Promise<number> {
  const mode = parseEvalArgs(argv);
  if (mode.kind === 'refused') {
    deps.log(`eval:ai refused: ${mode.reason}`);
    return 2;
  }
  // Live runs measure the runtime's paid capabilities by default; relevance has no paid route at
  // runtime (owner decisions 6) and is measured only when explicitly selected.
  const capabilities: readonly Capability[] =
    mode.only !== null
      ? [mode.only]
      : mode.kind === 'live'
        ? CAPABILITIES.filter((capability) => capability !== 'fast-context')
        : CAPABILITIES;
  let binding: LiveBinding | null = null;
  const tasks = new AccountingTasks();
  let context: EvalContext;
  if (mode.kind === 'live') {
    const transport = deps.transport;
    if (transport === undefined) {
      deps.log('eval:ai refused: NO_TRANSPORT');
      return 2;
    }
    const checked = await preflight(
      { approvalId: mode.approvalId, runId: mode.runId, model: mode.model, capabilities },
      deps.env,
      deps.connect,
    );
    if (!checked.ok) {
      deps.log(`eval:ai refused: ${checked.reason}`);
      return 2;
    }
    const live = checked.binding;
    binding = live;
    if (liveGateway(live, transport, tasks) === null) {
      await live.pool.end();
      deps.log('eval:ai refused: ROUTE_REFUSED');
      return 2;
    }
    context = liveContext((sending) => {
      const gateway = liveGateway(live, sending, tasks);
      if (gateway === null) throw new Error('ROUTE_REFUSED');
      return gateway;
    }, transport);
  } else context = offlineContext(deps.env);

  try {
    const runners = deps.runners ?? RUNNERS;
    const startedAt = deps.now();
    const source = await (deps.source ?? gitSourceState)();
    const name =
      mode.kind === 'live'
        ? `live-${mode.runId.replaceAll(/[^A-Za-z0-9.-]/g, '-')}-${newRunId(startedAt)}`
        : `offline-${newRunId(startedAt)}`;
    const run = await createRunDirectory(mode.outRoot, name);
    const results: Partial<Record<Capability, CapabilityResult>> = {};
    const errors: Record<string, string> = {};
    for (const capability of capabilities) {
      try {
        results[capability] = await runners[capability](context);
      } catch (error) {
        errors[capability] = error instanceof Error ? error.name : 'error';
      }
    }
    await tasks.idle();
    const finishedAt = deps.now();

    const config = binding?.config ?? loadConfig(offlineEnv(deps.env)).ai;
    const [provider = '', model = ''] = (binding?.model ?? DEFAULT_EVAL_MODEL).split(':');
    const entry = configuredEntry(VERIFIED_CATALOG, provider, model);
    const charges = runCharges(results);
    const rows = Object.values(results).flatMap((result) => result.rows);
    await run.write(
      'manifest.json',
      json({
        mode: mode.kind,
        live: mode.kind === 'live',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        source,
        configuration: configurationRecord({
          mode: mode.kind,
          capabilities,
          routes: binding?.routes ?? null,
          relevanceBudgetMs: config.relevanceBudgetMs,
          requestTimeoutMs: config.requestTimeoutMs,
          approvalId: binding?.approvalId ?? null,
          runId: binding?.runId ?? null,
          campaignId: EVAL_CAMPAIGN,
          entry: binding?.entry ?? null,
        }),
        modelIdentity: {
          configured: binding?.model ?? null,
          canonical: binding?.entry.model ?? null,
          returnedModels: [...new Set(rows.flatMap((row) => row.accounting.returnedModels))],
          providerRequestIds: rows.reduce((n, row) => n + row.accounting.providerRequestIds, 0),
        },
        cases: caseInventory(capabilities),
        knownMissingCharges: {
          openAttempts: charges.openAttempts,
          heldMicros: charges.heldMicros,
          note: 'held attempts have no verified charge until operator reconciliation',
        },
        charges,
        summaries: Object.fromEntries(
          Object.entries(results).map(([capability, result]) => [capability, summarize(result)]),
        ),
        errors,
        blindComparison: BLIND_COMPARISON,
      }),
    );
    await run.write('eval-results.json', json(results));
    const md = [...headerMarkdown(mode.kind)];
    for (const capability of capabilities) {
      const result = results[capability];
      md.push(
        ...(result === undefined
          ? [`## ${capability}`, '', `ERROR ${errors[capability] ?? ''}`, '']
          : capabilityMarkdown(capability, result)),
      );
    }
    if (entry !== null) {
      md.push(...estimateMarkdown(sessionEstimate(entry, usageSamples(results)), charges));
    }
    md.push(`Blind NPC voice comparison: ${BLIND_COMPARISON}.`, '');
    await run.write('eval-report.md', `${md.join('\n')}\n`);
    deps.log(`${mode.kind} evaluation written to ${run.path}`);
    return 0;
  } finally {
    await tasks.idle();
    await binding?.pool.end();
  }
}
