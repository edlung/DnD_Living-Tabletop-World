/**
 * The campaign move's command line (`campaign-move-cli.ts`; docs/adr/0061-local-mode.md §5): which command, which
 * campaign, where to, which file. Refuses anything else with the usage.
 */
export type Command =
  | {
      readonly kind: 'export';
      readonly campaign: string;
      readonly to: string | null;
      readonly out: string | null;
    }
  | { readonly kind: 'import'; readonly in: string | null }
  | { readonly kind: 'status'; readonly campaign: string }
  | { readonly kind: 'cancel'; readonly campaign: string };

export class UsageError extends Error {}

const USAGE =
  'usage: export --campaign <id> [--move --to <where>] [--out <file>] | import [--in <file>] | status --campaign <id> | cancel --campaign <id>';

export function parseMoveArgs(args: readonly string[]): Command {
  const [kind, ...rest] = args;
  const flags = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index] ?? '';
    if (!flag.startsWith('--')) throw new UsageError(USAGE);
    if (flag === '--move') {
      flags.set('move', true);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new UsageError(`${flag} needs a value`);
    flags.set(flag.slice(2), value);
    index += 1;
  }
  const text = (name: string) => {
    const value = flags.get(name);
    return typeof value === 'string' ? value : null;
  };
  const allow = (...names: string[]) => {
    for (const name of flags.keys()) if (!names.includes(name)) throw new UsageError(USAGE);
  };
  const campaign = text('campaign');
  if (kind === 'import') {
    allow('in');
    return { kind, in: text('in') };
  }
  if (campaign === null || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(campaign))
    throw new UsageError(USAGE);
  if (kind === 'export') {
    allow('campaign', 'move', 'to', 'out');
    const to = text('to');
    if ((flags.get('move') === true) !== (to !== null)) {
      throw new UsageError('--move and --to <where> go together');
    }
    if (to !== null && (to.trim().length === 0 || to.length > 80)) {
      throw new UsageError('--to names the destination in 1 to 80 characters');
    }
    return { kind, campaign, to: to?.trim() ?? null, out: text('out') };
  }
  if (kind === 'status' || kind === 'cancel') {
    allow('campaign');
    return { kind, campaign };
  }
  throw new UsageError(USAGE);
}
