import { useT } from '@ltw/ui';

import { Glyph } from '../visual/glyph.tsx';
import { nativeShell } from './shell.ts';

/**
 * Where a person signs in or picks a campaign, the apps offer their own two doors
 * (docs/adr/0070-native-apps.md §4): the QR scanner, which opens a table's or an invitation's code
 * in the game, and the server the app plays on. In a browser there is nothing here.
 */
export function NativeEntry() {
  const t = useT();
  const shell = nativeShell();
  if (shell === null || shell.app === 'tv') return null;
  const scan = shell.has('scan');
  const server = shell.has('server');
  if (!scan && !server) return null;
  return (
    <div className="action-row native-entry">
      {scan && (
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            shell.post({ type: 'scan' });
          }}
        >
          <Glyph name="invitation" />
          {t('Scan the table’s code')}
        </button>
      )}
      {server && (
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            shell.post({ type: 'server' });
          }}
        >
          <Glyph name="link" />
          {t('Server: {host}', { host: window.location.host })}
        </button>
      )}
    </div>
  );
}
