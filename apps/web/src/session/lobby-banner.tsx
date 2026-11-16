import type { LobbyResponse } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { recapParagraphs } from '../chronicle/book-chapters.ts';
import { Previously, usePreviously } from '../chronicle/previously.tsx';
import { PauseAsk } from '../pause/pause-ask.tsx';
import { calendarHref, NextGameLine, useCalendarFile } from '../ritual/next-game.tsx';
import { AgreementCard } from '../ritual/agreement.tsx';
import { useEnding } from '../ritual/ending.ts';
import { FinishedCard } from '../ritual/keepsake-card.tsx';
import { StarsCard } from '../ritual/stars-card.tsx';
import { Glyph } from '../visual/glyph.tsx';

/**
 * A player's view of the table around a session (docs/adr/0043-dm-screen.md §6): while no session
 * is open, "ready" for the one to come and "Previously…" to read meanwhile (ADR 0071 §1.4: the
 * party's last chapter, for the player who missed the evening too); while the DM has paused the
 * game, that it waits; while it plays, the one-press way to ask for a pause
 * (docs/adr/0073-table-ideas.md §2). Nothing
 * otherwise for a player, and nothing of this for the DM (the Session sheet is theirs). Everyone,
 * the DM too, reads when the campaign plays on another server since a move: here it is looked at,
 * not played (docs/adr/0061-local-mode.md §5). It lies first among the table's questions over the
 * stage (`alerts/table-asks.tsx`), whose slot announces it.
 */
export function LobbyBanner({
  api,
  actorId,
  isDm,
  onOpenChronicle,
  onOpenBook,
  fightSlot = null,
}: {
  readonly api: WorldApi;
  /** The acting character; none, no player's banner. */
  readonly actorId: string | null;
  readonly isDm: boolean;
  /**
   * In a fight: the element of the fight's own layout that holds the way to a pause, so that it
   * lies clear of the turn order and of the fight's own controls; none outside a fight.
   */
  readonly fightSlot?: string | null;
  /** Opens the book at a chapter. */
  readonly onOpenChronicle: (chronicleId: string) => void;
  /** Opens the campaign's whole book. */
  readonly onOpenBook: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const load = useCallback((signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal), [api]);
  const lobby = useResource(`lobby:${actorId ?? ''}`, load);
  const [busy, setBusy] = useState(false);
  const calendarFile = useCalendarFile();
  const end = useEnding(api);
  // The fight's own place for the quiet row, once the fight's layout has drawn it.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(fightSlot === null ? null : document.getElementById(fightSlot));
  }, [fightSlot]);
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
  // A finished adventure (ADR 0072 §2): everyone reads that it is read now, not played; a player
  // chooses what their hero keeps, and still writes the last evening's star.
  if (end.ending !== null && end.ending.ending !== null && session === null) {
    return (
      <>
        <FinishedCard
          api={api}
          ending={end.ending}
          characterId={isDm ? null : actorId}
          onOpenBook={onOpenBook}
          onChanged={end.reread}
        />
        {!isDm && actorId !== null && <StarsCard api={api} characterId={actorId} last />}
      </>
    );
  }
  if (isDm || actorId === null) return null;
  const mine = characters.find((entry) => entry.character.entityId === actorId);
  // A game in play has no lobby; the table's agreement still asks to be read (a campaign may
  // begin with its first session already open).
  // And the one-press way to a pause (ADR 0073 §2): told to the DM alone.
  if (session !== null && !paused) {
    const row = (
      <div className="quiet-row">
        <PauseAsk api={api} />
      </div>
    );
    return (
      <>
        <AgreementCard api={api} characterId={actorId} />
        {fightSlot === null ? row : slot?.isConnected ? createPortal(row, slot) : null}
      </>
    );
  }
  return (
    <>
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
      {/* A server from before the date sends none. */}
      {session === null && lobby.resource.value.nextGame && (
        <NextGameLine
          next={lobby.resource.value.nextGame}
          calendar={calendarFile ? calendarHref(api.campaignId) : null}
          className="next-game--lobby"
        />
      )}
      {/* The table's agreement, until this player has said "Understood" (ADR 0071 §4). */}
      <AgreementCard api={api} characterId={actorId} />
      {session === null && <StarsCard api={api} characterId={actorId} />}
      {session === null && <LobbyPreviously api={api} onOpenChronicle={onOpenChronicle} />}
    </>
  );
}

/**
 * "Previously…" while the table waits for the session: the chapter's title and where it left off, the
 * whole recap on demand (folded back by its own control), and the way into the book. The brief is
 * put away for the page's life by its own control; nothing is kept in browser storage.
 */
function LobbyPreviously({
  api,
  onOpenChronicle,
}: {
  readonly api: WorldApi;
  readonly onOpenChronicle: (chronicleId: string) => void;
}) {
  const t = useT();
  const previously = usePreviously(api, true);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Folded back: focus returns to the control that opened it.
  const opener = useRef<HTMLButtonElement>(null);
  const folded = useRef(false);
  useEffect(() => {
    if (!open && folded.current) opener.current?.focus();
    folded.current = false;
  }, [open]);
  const { chapter } = previously;
  if (chapter === null || hidden) return null;
  if (open) {
    return (
      <Previously api={previously.api} chapter={chapter} className="previously--lobby" focus>
        <div className="action-row">
          <button
            type="button"
            onClick={() => {
              onOpenChronicle(chapter.chronicleId);
            }}
          >
            <Glyph name="chronicle" />
            {t('Open in the Chronicle')}
          </button>
          <button
            type="button"
            onClick={() => {
              folded.current = true;
              setOpen(false);
            }}
          >
            {t('Close the recap')}
          </button>
        </div>
      </Previously>
    );
  }
  return (
    <section className="previously-brief" aria-label={t('Previously…')}>
      <p className="previously-eyebrow">
        <Glyph name="chronicle" />
        {t('Previously…')}
      </p>
      <p className="previously-brief-title">{chapter.title}</p>
      <p className="previously-brief-opening">{recapParagraphs(chapter).at(-1) ?? ''}</p>
      <div className="action-row">
        <button
          ref={opener}
          type="button"
          className="primary-button"
          onClick={() => {
            // On a screen too short for the recap beside the scene, the book holds it.
            if (window.matchMedia('(max-height: 560px)').matches) {
              onOpenChronicle(chapter.chronicleId);
            } else setOpen(true);
          }}
        >
          {t('Read the recap')}
        </button>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
          }}
        >
          {t('Hide the recap')}
        </button>
      </div>
    </section>
  );
}
