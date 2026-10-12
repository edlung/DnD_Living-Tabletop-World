import { OFFLINE_EVIDENCE_ROOT, LIVE_EVIDENCE_ROOT } from './eval-output.ts';
import { CAPABILITIES, type Capability } from './eval-rows.ts';

/**
 * `pnpm eval:ai` arguments (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint C).
 *
 * - `--offline [capability] [--out dir]`: deterministic local providers only.
 * - `--live --approval <id> --run <id> [--model provider:model] [capability] [--out dir]`: an
 *   existing approval and an operator-registered run bound to it and to the evaluation campaign.
 *   The model defaults to the only runtime model, `anthropic:claude-sonnet-5-5`. Without a
 *   capability it evaluates intents, NPC dialogue and Chronicle; relevance, deterministic at
 *   runtime (owner decisions 6), is measured on a remote route only when `fast-context` is named.
 *
 * There is no ceiling, budget or dollar argument: every ceiling comes from the stored approval,
 * and anything unrecognized refuses the run. Parsing constructs nothing.
 */
export const DEFAULT_EVAL_MODEL = 'anthropic:claude-sonnet-5-5';

export type EvalMode =
  | { readonly kind: 'offline'; readonly only: Capability | null; readonly outRoot: string }
  | {
      readonly kind: 'live';
      readonly only: Capability | null;
      readonly outRoot: string;
      readonly approvalId: string;
      readonly runId: string;
      readonly model: string;
    }
  | { readonly kind: 'refused'; readonly reason: string };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MODEL = /^(anthropic|deepseek):[a-z0-9][a-z0-9.-]*$/;

const refuse = (reason: string): EvalMode => ({ kind: 'refused', reason });

export function parseEvalArgs(argv: readonly string[]): EvalMode {
  const flags = new Map<string, string>();
  let offline = false;
  let live = false;
  let only: Capability | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--offline') offline = true;
    else if (arg === '--live') live = true;
    else if (['--out', '--approval', '--run', '--model'].includes(arg)) {
      const value = argv[(index += 1)];
      if (value === undefined || value.startsWith('--')) return refuse(`${arg} needs a value`);
      if (flags.has(arg)) return refuse(`${arg} given twice`);
      flags.set(arg, value);
    } else if ((CAPABILITIES as readonly string[]).includes(arg) && only === null) {
      only = arg as Capability;
    } else return refuse(`unknown argument ${arg.slice(0, 40)}`);
  }
  if (offline === live) return refuse('choose exactly one of --offline or --live');
  if (offline) {
    if (flags.has('--approval') || flags.has('--run') || flags.has('--model')) {
      return refuse('--approval, --run and --model are live-only');
    }
    return { kind: 'offline', only, outRoot: flags.get('--out') ?? OFFLINE_EVIDENCE_ROOT };
  }
  const approvalId = flags.get('--approval');
  const runId = flags.get('--run');
  if (approvalId === undefined || !IDENTIFIER.test(approvalId)) {
    return refuse('live evaluation needs --approval <stored approval ID>');
  }
  if (runId === undefined || !IDENTIFIER.test(runId)) {
    return refuse('live evaluation needs --run <operator-registered run ID>');
  }
  const model = flags.get('--model') ?? DEFAULT_EVAL_MODEL;
  if (!MODEL.test(model)) return refuse('--model expects provider:model');
  return {
    kind: 'live',
    only,
    outRoot: flags.get('--out') ?? LIVE_EVIDENCE_ROOT,
    approvalId,
    runId,
    model,
  };
}
