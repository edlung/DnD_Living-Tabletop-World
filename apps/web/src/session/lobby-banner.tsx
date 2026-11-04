import type { LobbyResponse } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * A player's view of the table around a session (docs/adr/0043-dm-screen.md §6): while no session
 * is open, "ready" for the one to come; while the DM has paused the game, that it waits. Nothing
 * otherwise for a player, and nothing of this for the DM (the Session sheet is theirs). Everyone,
 * the DM too, reads when the campaign plays on another server since a move: here it is looked at,
 * not played (docs/adr/0061-local-mode.md §5). It lies first among the table's questions over the
 * stage (`alerts/table-asks.tsx`), whose slot announces it.
 */
export function LobbyBanner({
  api,
  actorId,
  isDm,
}: {
  readonly api: WorldApi;
  /** The acting character; none, no player's banner. */
  readonly actorId: string | null;
  readonly isDm: boolean;
}) {
  const t = useT();
  const language = useLanguage();
  const load = useCallback((signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal), [api]);
  const lobby = useResource(`lobby:${actorId ?? ''}`, load);
  const [busy, setBusy] = useState(false);
  if (lobby.resource.status !== 'ready') return null;
  const { session, paused, characters } = lobby.resource.value;
  // A server from before moves sends none.
  const away = lobby.resource.value.away ?? null;
  if (away !== null) {
    return (
      <div className="lobby-banner is-away">
        <Glyph name="travel" />
        <span>
          {t('This campaign is played on {where} since {when}: here you can look, not play.', {
            where: away.destination,
            when: new Intl.DateTimeFormat(language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(away.movedAt)),
          })}
        </span>
      </div>
    );
  }
  if (isDm || actorId === null) return null;
  const mine = characters.find((entry) => entry.character.entityId === actorId);
  if (session !== null && !paused) return null;
  return (
    <div className="lobby-banner">
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
  );
}
