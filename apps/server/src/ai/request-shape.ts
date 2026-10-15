import type { CatalogProvider } from './catalog.ts';

/**
 * The allowlist below a body's top-level fields (docs/STAGE_300_REMEDIATION_DESIGN.md §1; ADR 0032,
 * checkpoint C repair 1). A reservation assumes the request the adapter builds: one user message
 * (Anthropic) or one system and one user message (OpenAI-compatible), no assistant turn or
 * prefill; exactly the one client tool the request names, with no server or typed tool; and no
 * `cache_control` but the single 5-minute ephemeral breakpoint on Anthropic's system text, where
 * the entry permits it. Anything else could be billed beyond the bound, so admission is refused
 * before any reservation. Returns the fixed refusal reason, or null.
 */
type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Exactly these keys, in any order. */
const keysAre = (value: unknown, keys: readonly string[]): value is Json =>
  isRecord(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const textMessage = (value: unknown, role: string) =>
  keysAre(value, ['role', 'content']) &&
  value['role'] === role &&
  typeof value['content'] === 'string';

/** Whether a `cache_control` key occurs anywhere in `value`. */
function hasCacheControl(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCacheControl);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, inner]) => key === 'cache_control' || hasCacheControl(inner),
  );
}

function anthropicIssue(body: Json, toolName: string, cacheAllowed: boolean): string | null {
  const messages = body['messages'];
  if (!Array.isArray(messages) || messages.length !== 1 || !textMessage(messages[0], 'user')) {
    return 'messages';
  }
  const tools = body['tools'];
  const [tool] = Array.isArray(tools) ? (tools as unknown[]) : [];
  if (
    !Array.isArray(tools) ||
    tools.length !== 1 ||
    !keysAre(tool, ['name', 'description', 'input_schema']) ||
    tool['name'] !== toolName
  ) {
    return 'tools';
  }
  const system = body['system'];
  if (Array.isArray(system)) {
    const [block] = system as unknown[];
    const breakpoint =
      system.length === 1 &&
      keysAre(block, ['type', 'text', 'cache_control']) &&
      block['type'] === 'text' &&
      typeof block['text'] === 'string' &&
      keysAre(block['cache_control'], ['type']) &&
      block['cache_control']['type'] === 'ephemeral';
    if (!cacheAllowed || !breakpoint) return 'cache';
  } else if (typeof system !== 'string') {
    return 'system';
  }
  // The system breakpoint is checked above; none may appear anywhere else.
  return hasCacheControl(
    Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'system')),
  )
    ? 'cache'
    : null;
}

function openAiIssue(body: Json, toolName: string): string | null {
  const messages = body['messages'];
  if (
    !Array.isArray(messages) ||
    messages.length !== 2 ||
    !textMessage(messages[0], 'system') ||
    !textMessage(messages[1], 'user')
  ) {
    return 'messages';
  }
  const tools = body['tools'];
  const [tool] = Array.isArray(tools) ? (tools as unknown[]) : [];
  const fn = isRecord(tool) ? tool['function'] : undefined;
  if (
    !Array.isArray(tools) ||
    tools.length !== 1 ||
    !keysAre(tool, ['type', 'function']) ||
    tool['type'] !== 'function' ||
    !keysAre(fn, ['name', 'description', 'parameters']) ||
    fn['name'] !== toolName
  ) {
    return 'tools';
  }
  return hasCacheControl(body) ? 'cache' : null;
}

export function requestShapeIssue(
  provider: CatalogProvider,
  body: Json,
  toolName: string,
  cacheAllowed: boolean,
): string | null {
  return provider === 'anthropic'
    ? anthropicIssue(body, toolName, cacheAllowed)
    : openAiIssue(body, toolName);
}
