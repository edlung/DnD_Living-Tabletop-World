import { isIPv6 } from 'node:net';

/**
 * Network addresses for configuration and request limits (docs/adr/0036-production-sign-in.md,
 * amendment 2026-10-16): loopback hosts, the trusted reverse proxy, and the group a client
 * address is limited as. Parsing is strict; nothing here logs or echoes an address.
 */
export type Address =
  | { readonly version: 4; readonly bytes: readonly number[] }
  | { readonly version: 6; readonly hextets: readonly number[] };

const OCTET = /^(0|[1-9][0-9]{0,2})$/;

function ipv4Bytes(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

/** The eight 16-bit groups of an IPv6 address written without brackets or zone, or null. */
function ipv6Hextets(text: string): number[] | null {
  if (text.includes('%') || !isIPv6(text)) return null;
  let canonical: string;
  try {
    // The URL serializer writes hexadecimal groups only, with `::` at most once.
    canonical = new URL(`http://[${text}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [left = '', right] = canonical.split('::');
  const head = left === '' ? [] : left.split(':');
  const tail = right === undefined || right === '' ? [] : right.split(':');
  const zeros = right === undefined ? 0 : 8 - head.length - tail.length;
  const groups = [...head, ...Array.from({ length: Math.max(zeros, 0) }, () => '0'), ...tail];
  return groups.length === 8 ? groups.map((group) => Number.parseInt(group, 16)) : null;
}

/**
 * An IPv4 or IPv6 address, or null. An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`, how a
 * dual-stack socket reports an IPv4 client) is the IPv4 address. No brackets, no zone.
 */
export function parseAddress(text: string): Address | null {
  const bytes = ipv4Bytes(text);
  if (bytes !== null) return { version: 4, bytes };
  const hextets = ipv6Hextets(text);
  if (hextets === null) return null;
  const mapped = hextets.slice(0, 5).every((group) => group === 0) && hextets[5] === 0xffff;
  if (!mapped) return { version: 6, hextets };
  const [high = 0, low = 0] = hextets.slice(6);
  return { version: 4, bytes: [high >> 8, high & 0xff, low >> 8, low & 0xff] };
}

/** Whether an `HTTP_HOST` listens on loopback only: `localhost`, 127.0.0.0/8 or `::1`. */
export function isLoopbackHost(host: string): boolean {
  if (host.toLowerCase() === 'localhost') return true;
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const address = parseAddress(bare);
  if (address === null) return false;
  return address.version === 4
    ? address.bytes[0] === 127
    : address.hextets.every((group, index) => group === (index === 7 ? 1 : 0));
}

/**
 * The group a client address is limited as: an IPv4 address, or the /64 network of an IPv6 one
 * (one subscriber usually holds a whole /64, so its addresses are one client). Anything that is
 * not an address is one shared group, `unknown`: it is limited, never let through uncounted.
 */
export function clientGroup(ip: string | undefined): string {
  const address = ip === undefined ? null : parseAddress(ip.split('%')[0] ?? '');
  if (address === null) return 'unknown';
  if (address.version === 4) return address.bytes.join('.');
  const network = address.hextets.slice(0, 4).map((group) => group.toString(16));
  return `${network.join(':')}::/64`;
}

/**
 * `LTW_TRUST_PROXY`: `none`, or a comma-separated list of the reverse proxy's addresses or CIDR
 * ranges, whose `X-Forwarded-For` then names the client. Null when malformed. A range of every
 * address (`/0`) is refused: it would let any client choose the address it is limited as.
 */
export function parseTrustedProxies(value: string): readonly string[] | null {
  if (value.trim() === 'none') return [];
  const entries = value.split(',').map((entry) => entry.trim());
  return entries.every(isProxyEntry) ? entries : null;
}

function isProxyEntry(entry: string): boolean {
  const [address = '', prefix, extra] = entry.split('/');
  if (extra !== undefined || parseAddress(address) === null) return false;
  if (prefix === undefined) return true;
  const longest = address.includes(':') ? 128 : 32;
  return /^[1-9][0-9]{0,2}$/.test(prefix) && Number(prefix) <= longest;
}
