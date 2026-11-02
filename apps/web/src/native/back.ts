import { nativeShell, onShellMessage, type NativeShell } from './shell.ts';

/**
 * Android's system Back (docs/adr/0070-native-apps.md §7): the page answers it as Escape — the
 * topmost sheet, panel, flashback or dialog closes — and tells the shell whether something did;
 * when nothing did, the shell sends the app to the background (the game is never left by Back).
 */
export function installNativeBack(shell: NativeShell | null = nativeShell()): () => void {
  if (!shell?.has('back')) return () => undefined;
  return onShellMessage((message) => {
    if (message.type !== 'back') return;
    const handled = pressEscape(document);
    shell.post(
      message.id === undefined
        ? { type: 'back-result', handled }
        : { type: 'back-result', handled, id: message.id },
    );
  });
}

/**
 * Escape as a key would give it: first to whatever has focus (a sheet's or the flashback's own
 * handlers say they used it by preventing it), then an open modal dialog cancels and closes as
 * the browser closes one on Escape. True when something closed.
 */
export function pressEscape(page: Document): boolean {
  const dialog = page.querySelector('dialog[open]');
  const target = page.activeElement ?? dialog ?? page.body;
  const key = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  if (!target.dispatchEvent(key)) return true;
  if (!(dialog instanceof HTMLDialogElement)) return false;
  if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
  return true;
}
