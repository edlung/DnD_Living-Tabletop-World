import type { EntityRef, OpenedBook, PreparedEncounterView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { restAction } from '../rest/rest-intent.ts';
import type { SheetId } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { AskRoll, CastToScreen, GiveHandout, StartFight } from './actions.tsx';
import { CheckLines } from './cards.tsx';
import type { Leaf } from './model.ts';
import { encounterOf } from './moments.ts';

/**
 * The DM's actions as seals at the foot of the working spread's right page
 * (docs/adr/0075-book-interface.md §16): a roll, a fight, a rest, the table's screen, a handout —
 * each named with the table's own word and in view wherever the party is. A seal opens a slip on
 * the page: what this page of the story prepares for it first (its check, its chapter's fights
 * and handouts, its picture and words), then the way to the whole tool. Every action is one the
 * product already had (the Book's, the rest's): a seal adds no command.
 */
type SealId = 'roll' | 'fight' | 'rest' | 'screen' | 'give';
const SEALS: readonly { readonly id: SealId; readonly glyph: GlyphName }[] = [
  { id: 'roll', glyph: 'roll' },
  { id: 'fight', glyph: 'encounter' },
  { id: 'rest', glyph: 'dawn' },
  { id: 'screen', glyph: 'live' },
  { id: 'give', glyph: 'give' },
];

export function WorkSeals({
  api,
  opened,
  leaf,
  heroes,
  encounters,
  placeId,
  locked,
  covered,
  screenPage,
  onRun,
  onPage,
}: {
  readonly api: WorldApi;
  readonly opened: OpenedBook;
  /** The leaf the ribbon lies on: what its page and chapter prepare. */
  readonly leaf: Leaf;
  readonly heroes: readonly EntityRef[];
  readonly encounters: readonly PreparedEncounterView[];
  /** The place the Scene shows: its picture goes to the table's screen. */
  readonly placeId: string;
  readonly locked: boolean;
  /** Another page lies over the Scene: the seals under it are inert. */
  readonly covered: boolean;
  /** The table's screen has a page of its own (a table that signs in by invitation). */
  readonly screenPage: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  /** Opens a page of the book: the whole tool behind a seal. */
  readonly onPage: (page: SheetId) => void;
}) {
  const t = useT();
  const ids = useId();
  const [open, setOpen] = useState<SealId | null>(null);
  const slip = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const rest = useDiceTable()?.rest ?? null;
  useEffect(() => {
    if (open !== null) slip.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(null);
    opener.current?.focus({ preventScroll: true });
  };
  const toPage = (page: SheetId) => {
    setOpen(null);
    onPage(page);
  };
  const { chapter, page } = leaf;
  // The fights prepared at this place come first, then the chapter's and this page's own.
  const told = [
    ...chapter.encounters,
    ...(page?.cues ?? []).flatMap((cue) => (cue.encounter === undefined ? [] : [cue.encounter])),
  ].flatMap((key) => {
    const found = encounterOf(encounters, opened.ids.encounters[key]);
    return found ? [found] : [];
  });
  const fights = [
    ...encounters.filter((fight) => fight.location.entityId === placeId),
    ...told,
  ].filter(
    (fight, index, all) => all.findIndex((one) => one.encounterId === fight.encounterId) === index,
  );
  const handouts = chapter.handouts.flatMap((key) => {
    const found = opened.content.handouts.find((handout) => handout.key === key);
    return found ? [found] : [];
  });
  const aloud = page ? (page.readAloud ?? null) : chapter.readAloud;
  // The rolls this page asks for: its own check line, and those of its moments.
  const asks = [
    ...(page && page.check.line !== '' ? [{ key: 'page', title: null, check: page.check }] : []),
    ...(page?.cues ?? []).flatMap((cue) =>
      cue.check === undefined ? [] : [{ key: cue.key, title: cue.title, check: cue.check }],
    ),
  ];
  // What this page prepares shows on its seal: the rolls to ask, the fights to start, the
  // handouts to give — so the DM sees it before pressing.
  const ready: Readonly<Record<SealId, number>> = {
    roll: asks.filter((ask) => ask.check.options.length > 0).length,
    fight: fights.length,
    rest: 0,
    screen: 0,
    give: handouts.length,
  };
  const words: Readonly<Record<SealId, string>> = {
    roll: t('A roll'),
    fight: t('Fight'),
    rest: t('A rest'),
    screen: t('To the screen'),
    give: t('Hand out'),
  };
  const more = (label: string, to: SheetId) => (
    <button
      type="button"
      className="dmb-button work-more"
      onClick={() => {
        toPage(to);
      }}
    >
      {label}
      <Glyph name="chevron-right" />
    </button>
  );
  const bodies: Readonly<Record<SealId, ReactNode>> = {
    roll: (
      <>
        {asks.length > 0 ? (
          <ul className="work-list">
            {asks.map((ask) => (
              <li key={ask.key}>
                {ask.title !== null && <strong>{ask.title}</strong>}
                <CheckLines check={ask.check} chips={heroes.length === 0} />
                <AskRoll check={ask.check} heroes={heroes} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="dmb-status">{t('This page of the story asks for no roll.')}</p>
        )}
        {page && page.failForward !== '' && (
          <p className="work-aside">
            <strong>{t('If it fails')}.</strong> {page.failForward}
          </p>
        )}
        {more(t('Ask for a check of your own'), 'dice')}
      </>
    ),
    fight: (
      <>
        {fights.length > 0 ? (
          <ul className="work-list">
            {fights.map((fight) => (
              <li key={fight.encounterId}>
                <strong>{fight.title}</strong>
                {fight.location.entityId !== placeId && (
                  <span className="dmb-status">{fight.location.name}</span>
                )}
                {fight.summary !== '' && <p>{fight.summary}</p>}
                <StartFight
                  api={api}
                  encounter={fight}
                  onStarted={() => {
                    setOpen(null);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="dmb-status">{t('No fight is prepared for this place or this chapter.')}</p>
        )}
        {more(t('Every fight, and one of your own'), 'encounter')}
      </>
    ),
    rest: (
      <>
        {rest && (
          <p className="dmb-status">
            {t('A short rest is under way: players spend Hit Point Dice.')}
          </p>
        )}
        <div className="work-row">
          {rest ? (
            <button
              type="button"
              className="dmb-button dmb-button--main"
              disabled={locked}
              onClick={() => {
                onRun(restAction({ action: 'end' }));
                close();
              }}
            >
              {t('End the short rest')}
            </button>
          ) : (
            <button
              type="button"
              className="dmb-button dmb-button--main"
              disabled={locked}
              onClick={() => {
                onRun(restAction({ action: 'start', rest: 'short' }));
                close();
              }}
            >
              {t('Short rest (1 hour)')}
            </button>
          )}
          <button
            type="button"
            className="dmb-button"
            disabled={locked}
            onClick={() => {
              onRun(restAction({ action: 'start', rest: 'long' }));
              close();
            }}
          >
            {t('Long rest (8 hours)')}
          </button>
        </div>
        {more(t('Dawn, a rest cut short, the road’s hazards'), 'time')}
      </>
    ),
    screen: (
      <>
        <p>{t('The picture of this place goes to the table’s screen.')}</p>
        <CastToScreen api={api} entityId={placeId} words={aloud} />
        {screenPage && more(t('Everything the table’s screen shows'), 'screen')}
      </>
    ),
    give: (
      <>
        {handouts.length > 0 ? (
          <ul className="work-list">
            {handouts.map((handout) => (
              <li key={handout.key}>
                <strong>{handout.title}</strong>
                {handout.unlock !== undefined && <p className="dmb-status">{handout.unlock}</p>}
                {/* Given, it is the players': the DM reads it here first. */}
                {handout.text !== '' && (
                  <details className="dmb-secret">
                    <summary>{t('Its text')}</summary>
                    {handout.text.split(/\n+/u).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </details>
                )}
                <GiveHandout title={handout.title} text={handout.text} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="dmb-status">{t('This chapter has no handout of its own.')}</p>
        )}
        {more(t('Write a handout of your own'), 'party')}
      </>
    ),
  };
  const shown = SEALS.find((seal) => seal.id === open);
  return (
    <>
      <nav
        className="work-seals"
        aria-label={t('What the DM does')}
        data-surface="paper"
        inert={covered}
      >
        <ul>
          {SEALS.map((seal) => (
            <li key={seal.id}>
              <button
                type="button"
                className="work-seal"
                aria-expanded={open === seal.id}
                aria-controls={open === seal.id ? `${ids}-slip` : undefined}
                aria-describedby={ready[seal.id] > 0 ? `${ids}-ready-${seal.id}` : undefined}
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setOpen(open === seal.id ? null : seal.id);
                }}
              >
                <span className="work-seal-wax" aria-hidden="true">
                  <Glyph name={seal.glyph} />
                </span>
                <span className="work-seal-word">{words[seal.id]}</span>
              </button>
              {/* Beside the button, not in it: the seal's name stays its word. */}
              {ready[seal.id] > 0 && (
                <span className="work-seal-ready" id={`${ids}-ready-${seal.id}`}>
                  <span aria-hidden="true">{ready[seal.id]}</span>
                  <span className="visually-hidden">
                    {t('Prepared for this page: {count}', { count: ready[seal.id] })}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      {shown && (
        <section
          ref={slip}
          id={`${ids}-slip`}
          className="work-slip dmb"
          role="dialog"
          aria-labelledby={`${ids}-title`}
          data-surface="paper"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            close();
          }}
        >
          <header className="work-slip-head">
            <h3 id={`${ids}-title`}>{words[shown.id]}</h3>
            <button type="button" className="dmb-button" aria-label={t('Close')} onClick={close}>
              <Glyph name="close" />
            </button>
          </header>
          <div className="work-slip-body">{bodies[shown.id]}</div>
        </section>
      )}
    </>
  );
}
