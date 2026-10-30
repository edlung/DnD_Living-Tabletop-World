/**
 * `LTW_AI_ROUTES` (docs/adr/0032-live-ai.md, checkpoint B1): `capability=entry[,entry];…` with
 * entries `anthropic:<model>`, `deepseek:<model>` or `local`. Runtime routes respect ADR 0017's one
 * switch: intents, NPC dialogue and Chronicle prose are `local` or `remote,local`; relevance is one
 * remote entry (its fallback is the Context Engine). Three entries, two remotes or a remote-only
 * route outside relevance are rejected, never truncated. Only trusted evaluation (checkpoint C) may
 * use exactly one remote per capability with no local, so a fallback cannot hide in a measurement.
 * A remote entry needs its provider's key; a missing key never promotes another paid route.
 * Issues name the problem, never a value.
 */
export const ROUTE_CAPABILITIES = [
  'reasoning',
  'npc-dialogue',
  'narrative',
  'fast-context',
  'campaign-preparation',
] as const;
export type RouteProvider = 'anthropic' | 'deepseek';
export type RouteMode = 'runtime' | 'evaluation';

const ENTRY = /^(anthropic|deepseek):[a-z0-9][a-z0-9.-]*$/;
const SYNTAX = 'LTW_AI_ROUTES: expected capability=provider:model[,provider:model];…';

/** The syntax only: `capability=list` clauses, known capabilities each once, well-formed entries. */
export function parseRoutes(
  text: string | undefined,
  issues: string[],
): Record<string, readonly string[]> | null {
  if (text === undefined) return null;
  const routes: Record<string, readonly string[]> = {};
  for (const part of text.split(';').filter((entry) => entry.trim() !== '')) {
    // Exactly one '=' per clause: anything after a second one is an error, never dropped.
    const pieces = part.split('=').map((piece) => piece.trim());
    const [capability, list] = pieces;
    const entries = (list ?? '').split(',').map((entry) => entry.trim());
    const valid =
      pieces.length === 2 &&
      capability !== undefined &&
      (ROUTE_CAPABILITIES as readonly string[]).includes(capability) &&
      !(capability in routes) &&
      entries.every((entry) => entry === 'local' || ENTRY.test(entry));
    if (!valid) {
      issues.push(SYNTAX);
      return null;
    }
    routes[capability] = entries;
  }
  return routes;
}

const remoteOf = (entry: string): RouteProvider | null =>
  entry.startsWith('anthropic:') ? 'anthropic' : entry.startsWith('deepseek:') ? 'deepseek' : null;

function shapeAllowed(capability: string, entries: readonly string[], mode: RouteMode): boolean {
  const [first, second, ...rest] = entries;
  const remote = first !== undefined && remoteOf(first) !== null;
  if (
    mode === 'evaluation' ||
    capability === 'fast-context' ||
    capability === 'campaign-preparation'
  ) {
    return remote && second === undefined;
  }
  if (rest.length > 0) return false;
  return second === undefined ? first === 'local' : remote && second === 'local';
}

/** Problems with parsed routes for `mode`, given which providers have a key. */
export function routeIssues(
  routes: Readonly<Record<string, readonly string[]>>,
  mode: RouteMode,
  keyed: ReadonlySet<RouteProvider>,
): string[] {
  const issues: string[] = [];
  for (const [capability, entries] of Object.entries(routes)) {
    if (!shapeAllowed(capability, entries, mode)) {
      issues.push(
        mode === 'evaluation' ||
          capability === 'fast-context' ||
          capability === 'campaign-preparation'
          ? `LTW_AI_ROUTES: ${capability} takes exactly one remote provider`
          : `LTW_AI_ROUTES: ${capability} takes local, or one remote provider then local`,
      );
    }
    for (const entry of entries) {
      const provider = remoteOf(entry);
      if (provider !== null && !keyed.has(provider)) {
        issues.push(`LTW_AI_ROUTES: ${capability} names ${provider}, which has no key`);
      }
    }
  }
  return issues;
}
