import { useSyncExternalStore } from 'react';

import {
  nativeShell,
  onShellMessage,
  type NativeShell,
  type ShellMessage,
  type TvState,
} from './shell.ts';

/**
 * The TV of LTW DM (docs/adr/0070-native-apps.md §6): an external screen gets a window of its
 * own showing the table display, and the shell says how it stands — none connected, connected,
 * showing a code to pair, paired. The latest word is kept here for the Table screen sheet, which
 * may open long after it came.
 */
let current: TvState = { state: 'absent' };
const listeners = new Set<() => void>();

export function installNativeTv(shell: NativeShell | null = nativeShell()): () => void {
  if (shell?.app !== 'dm' || !shell.has('tv')) return () => undefined;
  return onShellMessage((message) => {
    if (message.type !== 'tv') return;
    current = stateOf(message);
    for (const listener of listeners) listener();
  });
}

const stateOf = (message: Extract<ShellMessage, { type: 'tv' }>): TvState => {
  switch (message.state) {
    case 'pairing':
      return { state: 'pairing', code: message.code };
    case 'paired':
      return message.campaign === undefined
        ? { state: 'paired' }
        : { state: 'paired', campaign: message.campaign };
    default:
      return { state: message.state };
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The TV's state in LTW DM; null anywhere else (a browser, the players' app). */
export function useNativeTv(): TvState | null {
  const shell = nativeShell();
  const state = useSyncExternalStore(subscribe, () => current);
  return shell?.app === 'dm' && shell.has('tv') ? state : null;
}
