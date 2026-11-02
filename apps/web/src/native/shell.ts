/**
 * The native apps' bridge, the page's side (docs/adr/0070-native-apps.md §2). LTW Player and LTW DM
 * install `window.ltwNative` at document start in the chosen server's main frame
 * (`apps/native-shim/ltw-native.js`) and send their own messages as `ltw-native` events. Every use
 * is an enhancement: without a shell the page keeps its browser behaviour.
 */
export type NativeApp = 'player' | 'dm' | 'tv';
export type NativeFeature = 'haptics' | 'awake' | 'waiting' | 'scan' | 'server' | 'back' | 'tv';
export type HapticKind = 'alert' | 'dice';

/** What the page asks of the shell. */
export type PageMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'haptic'; readonly kind: HapticKind }
  | { readonly type: 'awake'; readonly on: boolean }
  | { readonly type: 'waiting'; readonly count: number }
  | { readonly type: 'scan' }
  | { readonly type: 'server' }
  | { readonly type: 'back-result'; readonly handled: boolean; readonly id?: number }
  | { readonly type: 'tv-code'; readonly code: string }
  | { readonly type: 'tv-paired'; readonly campaign?: string }
  | { readonly type: 'tv-unpaired' }
  | { readonly type: 'tv-forget' };

/**
 * The TV connected to the DM's device, as LTW DM sees it (§6); a paired TV names the campaign it
 * shows, which may be another than the one this page runs.
 */
export type TvState =
  | { readonly state: 'absent' | 'connected' }
  | { readonly state: 'pairing'; readonly code: string }
  | { readonly state: 'paired'; readonly campaign?: string };

/**
 * What the shell tells the page: Android's Back (numbered, so a late answer is not taken for the
 * next press's), how the TV stands, and to the TV's own page, to forget its pairing.
 */
export type ShellMessage =
  | { readonly type: 'back'; readonly id?: number }
  | ({ readonly type: 'tv' } & TvState)
  | { readonly type: 'forget' };

export interface NativeShell {
  readonly platform: 'ios' | 'android';
  readonly app: NativeApp;
  readonly has: (feature: NativeFeature) => boolean;
  readonly post: (message: PageMessage) => void;
}

const PLATFORMS: ReadonlySet<string> = new Set(['ios', 'android']);
const APPS: ReadonlySet<string> = new Set(['player', 'dm', 'tv']);
const FEATURES: ReadonlySet<string> = new Set([
  'haptics',
  'awake',
  'waiting',
  'scan',
  'server',
  'back',
  'tv',
]);
/** A TV's pairing code, as the server makes it (`@ltw/contracts` `CODE_ALPHABET`). */
export const PAIRING_CODE = /^[A-HJKMNP-Z2-9]{8}$/;
/** A campaign's ID as the bridge carries it: opaque, short, no markup. */
export const CAMPAIGN_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const sequence = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** The fields this page reads of an object it was handed, each still to be checked. */
interface Fields {
  readonly version?: unknown;
  readonly platform?: unknown;
  readonly app?: unknown;
  readonly features?: unknown;
  readonly post?: unknown;
  readonly type?: unknown;
  readonly state?: unknown;
  readonly code?: unknown;
  readonly id?: unknown;
  readonly campaign?: unknown;
}

const record = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;

/** The shell the shim installed, if it is one this page understands (protocol version 1). */
export function readShell(value: unknown): NativeShell | null {
  const raw = record(value);
  if (raw === null || raw.version !== 1) return null;
  const { platform, app, features, post } = raw;
  if (typeof platform !== 'string' || !PLATFORMS.has(platform)) return null;
  if (typeof app !== 'string' || !APPS.has(app)) return null;
  if (!Array.isArray(features) || typeof post !== 'function') return null;
  const known = new Set(
    features.filter(
      (feature): feature is NativeFeature => typeof feature === 'string' && FEATURES.has(feature),
    ),
  );
  const send = post as (message: PageMessage) => void;
  return {
    platform: platform as NativeShell['platform'],
    app: app as NativeApp,
    has: (feature) => known.has(feature),
    post: (message) => {
      try {
        send(message);
      } catch {
        // A shell that went away mid-message: the page carries on as in a browser.
      }
    },
  };
}

let cached: NativeShell | null | undefined;

/** This page's shell, read once: `null` in a browser. */
export function nativeShell(): NativeShell | null {
  if (cached === undefined) {
    cached =
      typeof window === 'undefined'
        ? null
        : readShell((window as { readonly ltwNative?: unknown }).ltwNative);
  }
  return cached;
}

/** Strictly one of the shell's messages, or null. */
export function parseShellMessage(value: unknown): ShellMessage | null {
  const raw = record(value);
  if (raw === null) return null;
  if (raw.type === 'forget') return { type: 'forget' };
  if (raw.type === 'back') {
    if (raw.id === undefined) return { type: 'back' };
    return sequence(raw.id) ? { type: 'back', id: raw.id } : null;
  }
  if (raw.type !== 'tv') return null;
  const state = raw.state;
  if (state === 'absent' || state === 'connected') return { type: 'tv', state };
  if (state === 'paired') {
    if (raw.campaign === undefined) return { type: 'tv', state };
    return typeof raw.campaign === 'string' && CAMPAIGN_ID.test(raw.campaign)
      ? { type: 'tv', state, campaign: raw.campaign }
      : null;
  }
  if (state === 'pairing' && typeof raw.code === 'string' && PAIRING_CODE.test(raw.code)) {
    return { type: 'tv', state, code: raw.code };
  }
  return null;
}

/** Listens to the shell's messages; returns the way to stop. */
export function onShellMessage(listener: (message: ShellMessage) => void): () => void {
  const handle = (event: Event) => {
    const message = parseShellMessage((event as CustomEvent<unknown>).detail);
    if (message !== null) listener(message);
  };
  window.addEventListener('ltw-native', handle);
  return () => {
    window.removeEventListener('ltw-native', handle);
  };
}
