import type { CampaignBook, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { AskRoll } from './actions.tsx';
import { CheckLines, kindWord, type CardContent } from './cards.tsx';
import { minutesOf, type Leaf } from './model.ts';
import { MOMENT_KINDS, momentId, type Moment, type MomentLine } from './moments.ts';

/**
 * The right page under the picture (docs/adr/0074-dm-book.md §3.2): the brief of the spread —
 * what it is for, how it is played, its moments, the DM's own note — or the card of one moment
 * with a way back to the brief.
 */
export function MomentCard({
  card,
  onBack,
}: {
  readonly card: CardContent;
  readonly onBack: () => void;
}) {
  const t = useT();
  const titleId = useId();
  return (
    <section className="dmb-side" aria-labelledby={titleId} data-card={card.kind}>
      <div className="dmb-side-head">
        <h3 id={titleId} tabIndex={-1}>
          <span className="dmb-kind">{t(kindWord(card.kind))}</span>
          <br />
          {card.title}
        </h3>
        <button type="button" className="dmb-button" onClick={onBack}>
          <Glyph name="chevron-left" />
          {t('Back to the page')}
        </button>
      </div>
      {/* A long card scrolls: the keyboard reaches it too. */}
      <div className="dmb-side-body" role="group" aria-labelledby={titleId} tabIndex={0}>
        {card.body}
      </div>
    </section>
  );
}

function Moments({
  lines,
  onOpen,
}: {
  readonly lines: readonly MomentLine[];
  readonly onOpen: (moment: Moment, opener: HTMLElement) => void;
}) {
  const t = useT();
  if (lines.length === 0) return null;
  return (
    <>
      <h4>{t('Moments of this page')}</h4>
      <ul className="dmb-list">
        {lines.map((line) => (
          <li key={momentId(line.moment)}>
            <button
              type="button"
              className="dmb-moment"
              onClick={(event) => {
                onOpen(line.moment, event.currentTarget);
              }}
            >
              <Glyph name={MOMENT_KINDS[line.kind]?.glyph ?? 'info'} />
              <span className="dmb-moment-name">{line.name}</span>
              <span className="dmb-moment-kind">{t(kindWord(line.kind))}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Brief({
  book,
  leaf,
  lines,
  heroes,
  note,
  onNote,
  onOpen,
}: {
  readonly book: CampaignBook;
  readonly leaf: Leaf;
  readonly lines: readonly MomentLine[];
  /** The party's heroes: a roll of the page is asked of one of them, or of all. */
  readonly heroes: readonly EntityRef[];
  readonly note: string;
  readonly onNote: (note: string) => void;
  readonly onOpen: (moment: Moment, opener: HTMLElement) => void;
}) {
  const t = useT();
  const ids = useId();
  const { chapter, page } = leaf;
  const minutes = minutesOf(chapter);
  return (
    <section className="dmb-side" aria-labelledby={`${ids}-title`}>
      <div className="dmb-side-head">
        <h3 id={`${ids}-title`} tabIndex={-1}>
          {t('How we play this')}
        </h3>
      </div>
      <div className="dmb-side-body">
        {page === null ? (
          <>
            {chapter.goal !== '' && (
              <>
                <h4>{t('What the chapter is for')}</h4>
                <p>{chapter.goal}</p>
              </>
            )}
            {chapter.dmNote !== '' && (
              <>
                <h4>{t('The campaign’s note for the DM')}</h4>
                <p>{chapter.dmNote}</p>
              </>
            )}
            <dl className="dmb-facts">
              {(chapter.duration ?? '') !== '' && (
                <div style={{ display: 'contents' }}>
                  <dt>{t('Plays for')}</dt>
                  <dd>{chapter.duration}</dd>
                </div>
              )}
              {minutes > 0 && (
                <div style={{ display: 'contents' }}>
                  <dt>{t('Its scenes')}</dt>
                  <dd>
                    {t('{count} pages, about {minutes} minutes', {
                      count: chapter.pages.length,
                      minutes,
                    })}
                  </dd>
                </div>
              )}
              {chapter.level !== undefined && (
                <div style={{ display: 'contents' }}>
                  <dt>{t('Heroes’ level')}</dt>
                  <dd>{chapter.level}</dd>
                </div>
              )}
            </dl>
            {chapter.guide.map((entry) => (
              <details key={entry.title} className="dmb-secret">
                <summary>{entry.title}</summary>
                <p>{entry.text}</p>
              </details>
            ))}
            {chapter.detour && (
              <details className="dmb-secret">
                <summary>{t('If the party changed the plan')}</summary>
                <p>{chapter.detour.choice}</p>
                <p>{chapter.detour.result}</p>
              </details>
            )}
          </>
        ) : (
          <>
            {page.note !== undefined && <p>{page.note}</p>}
            {page.question !== undefined && (
              <>
                <h4>{t('Ask the table')}</h4>
                <p>{page.question}</p>
              </>
            )}
            {page.check.line !== '' && (
              <>
                <h4>{t('The roll')}</h4>
                <CheckLines check={page.check} chips={heroes.length === 0} />
                <AskRoll check={page.check} heroes={heroes} />
              </>
            )}
            {page.failForward !== '' && (
              <>
                <h4>{t('If it fails')}</h4>
                <p>{page.failForward}</p>
              </>
            )}
            {page.choices.length > 0 && (
              <>
                <h4>{t('What the players may choose')}</h4>
                <ul>
                  {page.choices.map((choice) => (
                    <li key={choice}>{choice}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <Moments lines={lines} onOpen={onOpen} />
        {page === null && (chapter.ending !== '' || chapter.reward.length > 0) && (
          <details className="dmb-secret">
            <summary>{t('How the chapter ends')}</summary>
            {chapter.ending !== '' && <p>{chapter.ending}</p>}
            {chapter.reward.map((reward) => (
              <p key={reward}>{reward}</p>
            ))}
            {chapter.consequences.map((entry) => (
              <p key={entry.if}>
                <strong>{entry.if}</strong> — {entry.then}
              </p>
            ))}
            {chapter.rest !== undefined && <p>{chapter.rest}</p>}
          </details>
        )}
        <h4>
          <label htmlFor={`${ids}-note`}>{t('Your note on this page')}</label>
        </h4>
        <textarea
          id={`${ids}-note`}
          className="dmb-note"
          value={note}
          maxLength={2000}
          placeholder={t('Only you see it')}
          onChange={(event) => {
            onNote(event.target.value);
          }}
        />
        {book.looseEncounters.length > 0 &&
          page === null &&
          chapter.number === book.chapters[0]?.number && (
            <p className="dmb-status">
              {t(
                'Fights the campaign prepared without naming a chapter: {count}. They are in the Encounter section.',
                {
                  count: book.looseEncounters.length,
                },
              )}
            </p>
          )}
      </div>
    </section>
  );
}
