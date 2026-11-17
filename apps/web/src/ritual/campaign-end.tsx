import { ENDING_LINE_CHARS, type EndingResponse } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { writeEnding } from './ending.ts';
import { ClosingWords, KeepsakeList } from './keepsake-card.tsx';
import { KeepsakeForm } from './keepsake-form.tsx';
import { readerLocale } from './next-game-words.ts';

type Said =
  | { readonly kind: 'finished' | 'reopened' | 'taken' }
  | { readonly kind: 'kept'; readonly name: string };

/**
 * The adventure's end on the DM's Session sheet (docs/adr/0072-keepsakes.md §2). Between sessions
 * the DM may finish the campaign, with closing words to the table: from then it is read, not
 * played, and every hero's player chooses a keepsake. Finished, the sheet says since when, lists
 * what the heroes keep, lets the DM choose for someone who said theirs aloud, and reopens the
 * campaign. What was done is said in the block's own status, and focus goes to the block's title
 * when the control that was pressed is gone.
 */
export function CampaignEnd({
  api,
  ending,
  sessionOpen,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly ending: EndingResponse;
  /** An evening is open: it is closed before a campaign is finished. */
  readonly sessionOpen: boolean;
  readonly onChanged: () => void;
}) {
  const t = useT();
  const ids = useId();
  const locale = readerLocale(useLanguage());
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  const [failed, setFailed] = useState<'finish' | 'reopen' | null>(null);
  const [asked, setAsked] = useState(false);
  const [whose, setWhose] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const who = useRef<HTMLSelectElement>(null);
  // Where focus goes once what was pressed is gone: the block's title, or "Who is it for?".
  const [moved, setMoved] = useState<{ readonly to: 'title' | 'who' } | null>(null);
  useEffect(() => {
    if (moved === null) return;
    (moved.to === 'who' ? (who.current ?? title.current) : title.current)?.focus();
  }, [moved]);
  const end = ending.ending;
  const change = async (finished: boolean) => {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    setFailed(null);
    const done = await writeEnding(api, finished ? { finished, line: line.trim() } : { finished });
    setBusy(false);
    if (done) {
      setAsked(false);
      setSaid({ kind: finished ? 'finished' : 'reopened' });
      setMoved({ to: 'title' });
    } else {
      setFailed(finished ? 'finish' : 'reopen');
    }
    onChanged();
  };
  const hero = ending.heroes.find((one) => one.entityId === whose) ?? null;
  const words =
    said === null
      ? ''
      : said.kind === 'finished'
        ? t('The campaign is finished. Everyone may choose what their hero keeps.')
        : said.kind === 'reopened'
          ? t('The campaign is open for play again.')
          : said.kind === 'kept'
            ? t('Kept for {name}.', { name: said.name })
            : t('Nothing is kept now.');
  return (
    <section className="tool-group campaign-end" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`} ref={title} tabIndex={-1}>
        <Glyph name="chronicle" />
        {t('The adventure’s end')}
      </h3>
      {end === null ? (
        sessionOpen ? (
          <p className="muted">
            {t('When the adventure is over, end the session first, then finish the campaign here.')}
          </p>
        ) : (
          <details
            className="campaign-end-finish"
            open={asked}
            onToggle={(event) => {
              setAsked(event.currentTarget.open);
            }}
          >
            <summary>{t('Finish the campaign')}</summary>
            <p>
              {t(
                'A finished campaign is not played, but its Chronicle, its book and its characters stay to be read. Everyone chooses what their hero keeps. You can open it for play again at any time.',
              )}
            </p>
            <label htmlFor={`${ids}-line`}>
              {t('A few closing words for the table (optional)')}
            </label>
            <textarea
              id={`${ids}-line`}
              rows={2}
              maxLength={ENDING_LINE_CHARS}
              value={line}
              onChange={(event) => {
                setLine(event.target.value);
              }}
            />
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                aria-disabled={busy}
                onClick={() => void change(true)}
              >
                {t('Yes, finish the campaign')}
              </button>
            </div>
          </details>
        )
      ) : (
        <>
          <p>
            {t('Finished on {day}. Now it can only be read.', {
              // Russian ends a date in "г.", and the sentence's own full stop follows it.
              day: new Intl.DateTimeFormat(locale, { dateStyle: 'long' })
                .format(new Date(end.finishedAt))
                .replace(/\s*г\.$/, ''),
            })}
          </p>
          <ClosingWords ending={end} />
          {ending.keepsakes.length > 0 ? (
            <KeepsakeList keepsakes={ending.keepsakes} />
          ) : (
            <p className="muted">
              {t('Nobody has chosen a keepsake yet. Players choose on their own screens.')}
            </p>
          )}
          <details className="campaign-end-for">
            <summary>{t('Choose a keepsake for someone')}</summary>
            <label htmlFor={`${ids}-whose`}>{t('Who is it for?')}</label>
            <select
              ref={who}
              id={`${ids}-whose`}
              value={whose}
              onChange={(event) => {
                setWhose(event.target.value);
                setSaid(null);
              }}
            >
              <option value="">{t('Choose…')}</option>
              {ending.heroes.map((one) => (
                <option key={one.entityId} value={one.entityId}>
                  {one.name}
                </option>
              ))}
            </select>
            {hero !== null && (
              <KeepsakeForm
                key={hero.entityId}
                api={api}
                characterId={hero.entityId}
                heroName={hero.name}
                kept={ending.keepsakes.find((kept) => kept.hero.entityId === hero.entityId) ?? null}
                onDone={(kept) => {
                  setSaid(kept ? { kind: 'kept', name: hero.name } : { kind: 'taken' });
                  setWhose('');
                  setMoved({ to: 'who' });
                  onChanged();
                }}
                onCancel={() => {
                  setWhose('');
                  setMoved({ to: 'who' });
                }}
              />
            )}
          </details>
          <div className="action-row">
            <button type="button" aria-disabled={busy} onClick={() => void change(false)}>
              {t('Reopen the campaign')}
            </button>
          </div>
        </>
      )}
      {/*
       * What was done is said politely, in a line that stays; what failed is said at once, in a
       * line that is there only while something failed — the Session sheet has no alert otherwise.
       */}
      <p role="status" className="muted campaign-end-said">
        {words}
      </p>
      {failed !== null && (
        <p role="alert" className="authoring-notice error campaign-end-failed">
          {failed === 'finish'
            ? t('The campaign could not be finished. Try again.')
            : t('The campaign could not be reopened. Try again.')}
        </p>
      )}
    </section>
  );
}
