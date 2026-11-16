import type { PauseAsksResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';

const wait = () => AbortSignal.timeout(20_000);
/** How long the card's last word stays where the card was. */
const SAID_MS = 8_000;

/**
 * The DM's side of a quiet request for a pause (docs/adr/0073-table-ideas.md §2): a card among
 * the table's questions over the stage — on the DM's screen and no other — for each player who
 * asked. "Pause the game" is the pause that exists (ADR 0043 §6), and answers everyone who
 * asked; "Not now" tells that one player the DM has seen it. Neither says to the table who asked.
 * The card's last word stays a moment where the card was and takes the focus its button held.
 */
export function PauseAsks({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PauseAsksResponse>('pause-requests', signal),
    [api],
  );
  // A re-read that fails keeps the cards shown (`api/resource.ts`).
  const asks = useResource('pause-asks', load);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const word = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (said === null) return;
    word.current?.focus();
    const timer = window.setTimeout(() => {
      setSaid(null);
    }, SAID_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [said]);
  const waiting =
    asks.resource.status === 'ready' ? asks.resource.value.asks.filter((ask) => !ask.seen) : [];
  const none = waiting.length === 0;
  // What failed was about a card that is gone: the next card starts clean.
  useEffect(() => {
    if (none) setFailed(false);
  }, [none]);
  // Its place among the cards does not move when the last card goes: it keeps the focus.
  const last =
    said === null ? null : (
      <p ref={word} tabIndex={-1} className="rest-banner break-said pause-said">
        <Glyph name="confirm" />
        <span className="rest-banner-text">{said}</span>
      </p>
    );
  const { reread } = asks;
  const act = (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFailed(false);
    void work()
      .then(
        () => {
          setSaid(done);
        },
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
      {waiting.map((ask) => {
        const name = ask.character.name ?? t('A player');
        const asksFor = t('{name} asks for a pause. Only you see this.', { name });
        return (
          <section
            key={ask.character.entityId}
            className="rest-banner break-card pause-card"
            aria-label={asksFor}
          >
            <p className="asked-check-what">
              <Glyph name="time" />
              <span className="rest-banner-text">{asksFor}</span>
            </p>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                aria-disabled={busy}
                onClick={() => {
                  if (busy) return;
                  act(
                    () => api.post('lobby', { paused: true }, wait(), true),
                    t('The game is paused. Resume it in Session.'),
                  );
                }}
              >
                {t('Pause the game')}
              </button>
              <button
                type="button"
                aria-disabled={busy}
                onClick={() => {
                  if (busy) return;
                  act(
                    () =>
                      api.post(
                        'pause-requests/answer',
                        { characterId: ask.character.entityId },
                        wait(),
                        true,
                      ),
                    t('{name} will read that you have seen it.', { name }),
                  );
                }}
              >
                {t('Not now')}
              </button>
            </div>
          </section>
        );
      })}
      {last}
      {failed && (
        <p role="alert" className="rest-banner authoring-notice error">
          {t('That did not work. Try again.')}
        </p>
      )}
    </>
  );
}
