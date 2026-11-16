import type { PauseAsksResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';

const wait = () => AbortSignal.timeout(20_000);

/**
 * The DM's side of a quiet request for a pause (docs/adr/0073-table-ideas.md §2): a card among
 * the table's questions over the stage — on the DM's screen and no other — for each player who
 * asked. "Pause the game" is the pause that exists (ADR 0043 §6), and answers everyone who
 * asked; "Not now" tells that one player the DM has seen it. Neither says to the table who asked.
 */
export function PauseAsks({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PauseAsksResponse>('pause-requests', signal).catch(() => null),
    [api],
  );
  const asks = useResource('pause-asks', load);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const waiting =
    asks.resource.status === 'ready'
      ? (asks.resource.value?.asks ?? []).filter((ask) => !ask.seen)
      : [];
  if (waiting.length === 0) return null;
  const { reread } = asks;
  const act = (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    void work()
      .then(
        () => undefined,
        () => {
          setFailed(true);
        },
      )
      .finally(() => {
        setBusy(false);
        reread();
      });
  };
  return (
    <>
      {waiting.map((ask) => (
        <section
          key={ask.character.entityId}
          className="rest-banner break-card pause-card"
          aria-label={t('A request for a pause')}
        >
          <p className="asked-check-what">
            <Glyph name="time" />
            <span className="rest-banner-text">
              {t('{name} asks for a pause. Only you see this.', {
                name: ask.character.name ?? t('A player'),
              })}
            </span>
          </p>
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              aria-disabled={busy}
              onClick={() => {
                if (!busy) act(() => api.post('lobby', { paused: true }, wait(), true));
              }}
            >
              {t('Pause the game')}
            </button>
            <button
              type="button"
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                act(() =>
                  api.post(
                    'pause-requests/answer',
                    { characterId: ask.character.entityId },
                    wait(),
                    true,
                  ),
                );
              }}
            >
              {t('Not now')}
            </button>
          </div>
          {failed && (
            <p role="alert" className="authoring-notice error">
              {t('That did not work. Try again.')}
            </p>
          )}
        </section>
      ))}
    </>
  );
}
