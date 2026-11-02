import { installNativeBack } from './back.ts';
import { nativeShell } from './shell.ts';
import { installNativeTv } from './tv.ts';

/**
 * The page's side of the bridge comes up once, before anything renders (docs/adr/0070-native-apps.md
 * §2): it listens for the shell's messages, then says it is ready so the shell sends what it holds
 * (LTW DM: the TV's state). Nothing happens in a browser.
 */
export function startNative(): void {
  const shell = nativeShell();
  if (shell === null) return;
  installNativeBack(shell);
  installNativeTv(shell);
  shell.post({ type: 'ready' });
}
