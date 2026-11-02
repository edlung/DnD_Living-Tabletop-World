import type { LobbyResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * A player's view of the table around a session (docs/adr/0043-dm-screen.md §6): while no session
 * is open, "ready" for the one to come; while the DM has paused the game, that it waits. Nothing
 * otherwise, and nothing for the DM (the Session sheet is theirs).
 */
export function LobbyBanner({
  api,
  actorId,
}: {
  readonly api: WorldApi;
  /** The acting character; none, no banner. */
  readonly actorId: string | null;
}) {
  const t = useT();
  const load = useCallback((signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal), [api]);
  const lobby = useResource(`lobby:${actorId ?? ''}`, load);
  const [busy, setBusy] = useState(false);
  if (actorId === null || lobby.resource.status !== 'ready') return null;
  const { session, paused, characters } = lobby.resource.value;
  const mine = characters.find((entry) => entry.character.entityId === actorId);
  if (session !== null && !paused) return null;
  return (
    <div className="lobby-banner-slot" aria-live="polite">
      <div className="lobby-banner" role="status">
        <Glyph name={paused ? 'time' : 'party'} />
        {session !== null ? (
          <span>{t('The DM paused the game. It waits until they resume.')}</span>
        ) : (
          <>
            <span>{t('The session has not started yet.')}</span>
            {mine && (
              <button
                type="button"
                className={mine.ready ? undefined : 'primary-button'}
                aria-pressed={mine.ready}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void api
                    .post(
                      'lobby/ready',
                      { characterId: actorId, ready: !mine.ready },
                      AbortSignal.timeout(20_000),
                      true,
                    )
                    .catch(() => undefined)
                    .finally(() => {
                      setBusy(false);
                      lobby.reread();
                    });
                }}
              >
                {mine.ready ? t('Ready — undo') : t('I am ready')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
