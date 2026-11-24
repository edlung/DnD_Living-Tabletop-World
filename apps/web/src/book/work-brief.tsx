import type { CampaignBook } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { Leaf } from './model.ts';

/**
 * A page the campaign wrote no words for (a book assembled from the campaign itself,
 * docs/adr/0075-book-interface.md §5, §16): the working spread's left page lays out what the book
 * does hold of it — how it is played, who is there as the campaign describes them, what can be
 * found there. Every phrase is the campaign's own; nothing is written for the gap. A name here is
 * a word, not a control: the one it names stands on the right page among who is here, and one
 * person is one button on a spread.
 */
export function PageBrief({
  book,
  leaf,
  hints,
  labelledBy,
}: {
  readonly book: CampaignBook;
  readonly leaf: Leaf;
  /** The page's notes for the DM, each under its word (no word: the note itself). */
  readonly hints: readonly (readonly [string, string])[];
  /** The page's title: the name of this part of it. */
  readonly labelledBy: string;
}) {
  const t = useT();
  const { chapter, page } = leaf;
  const named = page ? page.people.map((link) => link.person) : [];
  const people = [...new Set([...named, ...chapter.people])].flatMap((key) =>
    book.people.filter((person) => person.key === key),
  );
  const clues = chapter.clues.flatMap((key) => book.clues.filter((clue) => clue.key === key));
  // An empty page keeps its room, so the page's foot stays at the foot.
  if (hints.length === 0 && people.length === 0 && clues.length === 0)
    return <div className="work-brief" />;
  return (
    // A long brief scrolls: the keyboard reaches it too.
    <div className="work-brief" role="group" aria-labelledby={labelledBy} tabIndex={0}>
      {hints.length > 0 && (
        <dl>
          {hints.map(([label, words]) => (
            <div key={`${label}:${words.slice(0, 24)}`}>
              {label !== '' && <dt>{label}</dt>}
              <dd>{words}</dd>
            </div>
          ))}
        </dl>
      )}
      {people.length > 0 && (
        <>
          <h3>{t('Who is here by the book')}</h3>
          <ul>
            {people.map((person) => (
              <li key={person.key}>
                <strong>{person.name}</strong>
                {person.look !== '' && ` — ${person.look}`}
              </li>
            ))}
          </ul>
        </>
      )}
      {clues.length > 0 && (
        <>
          <h3>{t('What can be found here')}</h3>
          <ul>
            {clues.map((clue) => (
              <li key={clue.key}>
                <strong>{clue.name}</strong>
                {clue.statement !== '' && ` — ${clue.statement}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
