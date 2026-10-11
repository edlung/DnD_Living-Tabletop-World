import type { Env } from '../../platform/config/config.ts';
import { OFFLINE_EVIDENCE_ROOT, createRunDirectory, newRunId } from './eval-output.ts';
import { CAPABILITIES, type Capability, type CapabilityResult } from './eval-runners.ts';

/**
 * `pnpm eval:ai` at Stage 300 remediation checkpoint A (docs/STAGE_300_REMEDIATION_DESIGN.md §4).
 * Live evaluation is refused before any configuration, credential or provider is constructed:
 * durable admission is not connected yet (B2) and evaluation admission is checkpoint C. Only
 * `--offline` runs, on the deterministic local providers, into a fresh immutable directory; its
 * output is labelled offline and is never a live measurement.
 */
export type EvalMode =
  | { readonly kind: 'offline'; readonly only: Capability | null; readonly outRoot: string }
  | { readonly kind: 'refused'; readonly reason: string };

const LIVE_REFUSAL =
  'live evaluation is unavailable until durable admission (remediation B2) and evaluation admission (C); use --offline';

export function parseEvalArgs(argv: readonly string[]): EvalMode {
  let offline = false;
  let only: Capability | null = null;
  let outRoot = OFFLINE_EVIDENCE_ROOT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--offline') offline = true;
    else if (arg === '--out') {
      const value = argv[(index += 1)];
      if (value === undefined) return { kind: 'refused', reason: '--out needs a directory' };
      outRoot = value;
    } else if ((CAPABILITIES as readonly string[]).includes(arg) && only === null) {
      only = arg as Capability;
    } else
      return {
        kind: 'refused',
        reason: arg === '--live' ? LIVE_REFUSAL : `unknown argument ${arg}`,
      };
  }
  return offline ? { kind: 'offline', only, outRoot } : { kind: 'refused', reason: LIVE_REFUSAL };
}

export interface EvalDeps {
  readonly env: Env;
  readonly runners: Record<Capability, (env: Env) => Promise<CapabilityResult>>;
  readonly log: (line: string) => void;
  readonly now: () => Date;
}

/** Returns the process exit code. */
export async function runEval(argv: readonly string[], deps: EvalDeps): Promise<number> {
  const mode = parseEvalArgs(argv);
  if (mode.kind === 'refused') {
    deps.log(`eval:ai refused: ${mode.reason}`);
    return 2;
  }
  const startedAt = deps.now();
  const run = await createRunDirectory(mode.outRoot, `offline-${newRunId(startedAt)}`);
  const md = [
    '# Stage 300 — OFFLINE evaluation run (deterministic local providers)',
    '',
    'Not a live measurement: no remote provider was constructed or called. Checks are structural',
    'and lexical only; semantic correctness and quality are not assessed here.',
    '',
  ];
  const results: Record<string, CapabilityResult | { error: string }> = {};
  for (const capability of CAPABILITIES) {
    if (mode.only !== null && mode.only !== capability) continue;
    try {
      const result = await deps.runners[capability](deps.env);
      results[capability] = result;
      const passed = result.rows.filter((row) => row.structuralPass).length;
      md.push(
        `## ${capability}`,
        '',
        `providers: ${result.stats.providers.join(', ') || 'none (deterministic)'}; structural ${String(passed)}/${String(result.rows.length)}; attempts ${String(result.stats.calls)}; p50 ${String(result.stats.p50Ms)} ms`,
        '',
        ...result.rows.map(
          (row) => `- ${row.structuralPass ? 'ok' : 'FAIL'} ${row.case}: ${row.note}`,
        ),
        '',
      );
    } catch (error) {
      results[capability] = { error: error instanceof Error ? error.name : 'error' };
      md.push(`## ${capability}`, '', 'ERROR', '');
    }
  }
  await run.write(
    'manifest.json',
    `${JSON.stringify({ mode: 'offline', live: false, startedAt: startedAt.toISOString(), capabilities: Object.keys(results) }, null, 2)}\n`,
  );
  await run.write('eval-results.json', `${JSON.stringify(results, null, 2)}\n`);
  await run.write('eval-report.md', `${md.join('\n')}\n`);
  deps.log(`offline evaluation written to ${run.path}`);
  return 0;
}
