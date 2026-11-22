import type { CampaignBook, CampaignBookCheck, PreparedEncounterView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import type { ReactNode } from 'react';

import { MOMENT_KINDS, optionWords, type Moment } from './moments.ts';

/**
 * A moment's card on the right page (docs/adr/0074-dm-book.md §3.2): what the campaign prepared
 * for it, to read. Read-only: nothing here asks the world for anything. Where the campaign's data
 * has nothing for a line, the card says so and invents nothing (§1.6).
 */
export function CheckLines({ check }: { readonly check: CampaignBookCheck }) {
  const t = useT();
  if (check.line === '') return null;
  return (
    <>
      {check.options.length > 0 && (
        <ul className="dmb-chips" aria-label={t('The roll')}>
          {check.options.map((option) => {
            const words = optionWords(option);
            const label = t(words.frame, { name: t(words.name), dc: option.dc });
            return (
              <li key={`${words.name}-${words.frame}-${String(option.dc)}`} className="dmb-chip">
                {option.group ? t('{check} — the whole party', { check: label }) : label}
              </li>
            );
          })}
        </ul>
      )}
      {check.roll === 'none' && (
        <p>
          <strong>{t('No roll')}</strong>
        </p>
      )}
      <p>{check.line}</p>
    </>
  );
}

function Facts({ rows }: { readonly rows: readonly (readonly [string, string | undefined])[] }) {
  const shown = rows.filter((row): row is readonly [string, string] => (row[1] ?? '') !== '');
  if (shown.length === 0) return null;
  return (
    <dl className="dmb-facts">
      {shown.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface CardContent {
  readonly kind: string;
  readonly title: string;
  readonly body: ReactNode;
  /** The package key whose picture the card shows, when it has one of its own. */
  readonly subject: string | null;
}

/** What a moment's card says; null when the book has nothing under that key. */
export function useCard(
  book: CampaignBook,
  moment: Moment | null,
  chapterKey: string,
  encounters: (key: string) => PreparedEncounterView | null,
): CardContent | null {
  const t = useT();
  if (moment === null) return null;
  const gap = (text: string) => <p className="dmb-gap">{text}</p>;
  if (moment.kind === 'person') {
    const person = book.people.find((p) => p.key === moment.key);
    if (!person) return null;
    const empty = [person.look, person.public, person.want, person.voice ?? ''].every(
      (x) => x === '',
    );
    return {
      kind: 'person',
      title: person.name,
      subject: person.key,
      body: (
        <>
          <Facts
            rows={[
              [t('Looks'), person.look],
              [t('Everyone knows'), person.public],
              [t('Wants'), person.want],
              [t('Speaks'), person.voice],
              [t('Will not'), person.boundary],
              [t('Offers'), person.offer],
            ]}
          />
          {empty && gap(t('The campaign has no card for this person.'))}
          {person.knows.length > 0 && (
            <>
              <h4>{t('Knows')}</h4>
              <ul>
                {person.knows.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </>
          )}
          {(person.secret ?? person.reveal) !== undefined && (
            <details className="dmb-secret">
              <summary>{t('The secret — for the DM only')}</summary>
              {person.secret !== undefined && <p>{person.secret}</p>}
              {person.reveal !== undefined && (
                <p>
                  <strong>{t('Comes out when')}:</strong> {person.reveal}
                </p>
              )}
              {person.change !== undefined && (
                <p>
                  <strong>{t('May change')}:</strong> {person.change}
                </p>
              )}
            </details>
          )}
        </>
      ),
    };
  }
  if (moment.kind === 'clue') {
    const clue = book.clues.find((c) => c.key === moment.key);
    if (!clue) return null;
    return {
      kind: 'clue',
      title: clue.name,
      subject: null,
      body: (
        <>
          <Facts rows={[[t('Looks like'), clue.appearance]]} />
          <h4>{t('What it tells')}</h4>
          <p>{clue.statement}</p>
          <Facts
            rows={[
              [t('How it is found'), clue.discovery],
              [t('If they miss it'), clue.fallback],
            ]}
          />
        </>
      ),
    };
  }
  if (moment.kind === 'handout') {
    const handout = book.handouts.find((h) => h.key === moment.key);
    if (!handout) return null;
    return {
      kind: 'handout',
      title: handout.title,
      subject: null,
      body: (
        <>
          <Facts
            rows={[
              [t('When it is given'), handout.unlock],
              [t('What to do with it'), handout.task],
            ]}
          />
          <h4>{t('Its text')}</h4>
          {handout.text === ''
            ? gap(t('The campaign has no text for this handout.'))
            : handout.text.split(/\n+/u).map((line) => <p key={line}>{line}</p>)}
        </>
      ),
    };
  }
  if (moment.kind === 'encounter') {
    const found = encounters(moment.key);
    return {
      kind: 'encounter',
      title: found?.title ?? t('Fight'),
      subject: null,
      body: found ? (
        <>
          <Facts
            rows={[
              [t('Where'), found.location.name],
              [t('Foes who can fight'), String(found.foes)],
            ]}
          />
          <p>{found.summary}</p>
          <p className="dmb-status">{t('A prepared fight starts from the Encounter section.')}</p>
        </>
      ) : (
        gap(t('This fight is not among the campaign’s prepared ones now.'))
      ),
    };
  }
  if (moment.kind === 'puzzle') {
    const puzzle = book.chapters.find((c) => c.key === chapterKey)?.puzzle;
    if (!puzzle) return null;
    return {
      kind: 'puzzle',
      title: t('Puzzle'),
      subject: null,
      body: (
        <>
          <p>{puzzle.prompt}</p>
          {puzzle.hints.map((hint, index) => (
            <details key={hint} className="dmb-secret">
              <summary>{t('Hint {number}', { number: index + 1 })}</summary>
              <p>{hint}</p>
            </details>
          ))}
          <details className="dmb-secret">
            <summary>{t('The answer — for the DM only')}</summary>
            <p>{puzzle.solution}</p>
          </details>
        </>
      ),
    };
  }
  const cue = book.chapters
    .flatMap((chapter) => chapter.pages)
    .flatMap((page) => page.cues ?? [])
    .find((c) => c.key === moment.key);
  if (!cue) return null;
  const fight = cue.encounter === undefined ? null : encounters(cue.encounter);
  return {
    kind: cue.kind,
    title: cue.title,
    subject: cue.person ?? null,
    body: (
      <>
        <p>{cue.brief}</p>
        {cue.check && <CheckLines check={cue.check} />}
        {fight && (
          <Facts
            rows={[
              [t('Where'), fight.location.name],
              [t('Foes who can fight'), String(fight.foes)],
            ]}
          />
        )}
        {cue.details.map((detail) => (
          <div key={detail.label}>
            <h4>{detail.label}</h4>
            <p>{detail.text}</p>
          </div>
        ))}
      </>
    ),
  };
}

export const kindWord = (kind: string) => MOMENT_KINDS[kind]?.word ?? 'Moment';
