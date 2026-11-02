import { nativeShell, type HapticKind, type NativeShell } from './shell.ts';

/**
 * The alerts the shell carries further than a page can (docs/adr/0070-native-apps.md §5): the
 * screen kept on, the count of what waits (the app's badge, a notification while the app is out of
 * view) and a vibration on every device, an iPhone too.
 */
let holds = 0;

/** Keeps the screen on through the shell while anything holds it; returns the release. */
export function holdAwake(shell: NativeShell | null = nativeShell()): () => void {
  if (!shell?.has('awake')) return () => undefined;
  holds += 1;
  if (holds === 1) shell.post({ type: 'awake', on: true });
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds -= 1;
    if (holds === 0) shell.post({ type: 'awake', on: false });
  };
}

/** What waits for this player, as a count of 0–99 the shell shows and notifies. */
export function tellWaiting(count: number, shell: NativeShell | null = nativeShell()): void {
  if (!shell?.has('waiting')) return;
  const shown = Number.isFinite(count) ? Math.max(0, Math.min(99, Math.trunc(count))) : 0;
  shell.post({ type: 'waiting', count: shown });
}

/** A vibration through the shell; false where there is none, so the page uses its own. */
export function nativeHaptic(kind: HapticKind, shell: NativeShell | null = nativeShell()): boolean {
  if (!shell?.has('haptics')) return false;
  shell.post({ type: 'haptic', kind });
  return true;
}
