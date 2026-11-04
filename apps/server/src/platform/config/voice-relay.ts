/**
 * The table's voice relay (docs/adr/0060-voice.md §3): `LTW_TURN_URLS`, its `turn:`, `turns:` or
 * `stun:` addresses separated by commas, and `LTW_TURN_SECRET`, coturn's shared secret; both or
 * neither. Without them only direct connections carry the table's voices.
 */
export interface VoiceRelaySettings {
  readonly urls: readonly string[];
  /** Kept as the config's other secrets: never printed, never sent to a screen. */
  readonly secret: { reveal(): string };
}

const RELAY_URL = /^(turns?|stun):[a-z0-9.-]+(:\d{1,5})?(\?transport=(udp|tcp))?$/i;

export function parseVoiceRelay<S extends { reveal(): string }>(
  urls: string | undefined,
  secret: string | undefined,
  wrap: (value: string) => S,
  issues: string[],
): { readonly urls: readonly string[]; readonly secret: S } | null {
  if (urls === undefined && secret === undefined) return null;
  if (urls === undefined || secret === undefined) {
    issues.push('LTW_TURN_URLS and LTW_TURN_SECRET: set both, or neither');
    return null;
  }
  const list = urls.split(',').map((url) => url.trim());
  if (list.length === 0 || list.some((url) => !RELAY_URL.test(url))) {
    issues.push('LTW_TURN_URLS: turn:, turns: or stun: addresses separated by commas');
    return null;
  }
  if (secret.length < 16) {
    issues.push('LTW_TURN_SECRET: at least 16 characters');
    return null;
  }
  return { urls: list, secret: wrap(secret) };
}
