import type {
  CampaignBook,
  CampaignBookChapter,
  CampaignBookEnding,
  CampaignBookPage,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';

/**
 * The story's own preparation in the DM's book (docs/CAMPAIGN_TEXT_STANDARD.md §9–12): what
 * follows each choice of a page, a person's ready lines, the turns of the story a chapter plants
 * or reveals, and the ways the campaign can end with their epilogues. All of it is the DM's text,
 * plans and words to say — nothing here happened in the world until the table plays it.
 */

/** A page's choices, each with what follows it when the campaign wrote that. */
export function ChoiceForks({ page }: { readonly page: CampaignBookPage }) {
  const t = useT();
  if (page.choices.length === 0) return null;
  const forks = page.forks?.length === page.choices.length ? page.forks : undefined;
  return (
    <>
      <h4>
        {t(
          forks ? 'What the players may choose — and what follows' : 'What the players may choose',
        )}
      </h4>
      <ul className={forks ? 'dmb-forks' : undefined}>
        {page.choices.map((choice, index) => (
          <li key={choice}>
            {forks ? <strong>{choice}</strong> : choice}
            {forks?.[index] !== undefined && <p className="dmb-fork">{forks[index]}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** A person's ready lines: the situation, then the words. */
export function PersonLines({
  lines,
}: {
  readonly lines: readonly { readonly when: string; readonly say: string }[] | undefined;
}) {
  const t = useT();
  if (!lines || lines.length === 0) return null;
  return (
    <>
      <h4>{t('What they say')}</h4>
      <div className="dmb-lines">
        {lines.map((line) => (
          <p key={`${line.when}:${line.say}`}>
            <strong>{line.when}.</strong> {line.say}
          </p>
        ))}
      </div>
    </>
  );
}

/**
 * The turns of the story at a chapter's opening: what to plant tonight, the turn that comes out
 * tonight with what changes after it, and — folded — where the others stand.
 */
export function ChapterTurns({
  book,
  chapter,
}: {
  readonly book: CampaignBook;
  readonly chapter: CampaignBookChapter;
}) {
  const t = useT();
  const twists = book.twists ?? [];
  if (twists.length === 0) return null;
  const here = chapter.number;
  const seeds = twists.flatMap((twist) =>
    twist.seeds
      .filter((seed) => seed.chapter === here)
      .map((seed) => ({ title: twist.title, text: seed.text })),
  );
  const turns = twists.filter((twist) => twist.reveal.chapter === here);
  return (
    <details className="dmb-secret">
      <summary>{t('Turns of the story')}</summary>
      {seeds.length > 0 && (
        <div>
          <h4>{t('Plant tonight')}</h4>
          {seeds.map((seed) => (
            <p key={`${seed.title}:${seed.text}`}>
              <strong>{seed.title}.</strong> {seed.text}
            </p>
          ))}
        </div>
      )}
      {turns.map((twist) => (
        <div key={twist.title}>
          <h4>{t('The turn: {title}', { title: twist.title })}</h4>
          <p>{twist.turn}</p>
          <p>{twist.reveal.text}</p>
          <p>
            <strong>{t('After it')}:</strong> {twist.after}
          </p>
        </div>
      ))}
      <div>
        <h4>{t('All the turns')}</h4>
        {twists.map((twist) => (
          <p key={twist.title}>
            <strong>{twist.title}</strong> —{' '}
            {t('comes out in chapter {number}', { number: twist.reveal.chapter })}. {twist.turn}
          </p>
        ))}
      </div>
    </details>
  );
}

function Ending({ ending }: { readonly ending: CampaignBookEnding }) {
  const t = useT();
  return (
    <div className="dmb-ending">
      <h4>{ending.title}</h4>
      <p>
        <strong>{t('Needs')}:</strong> {ending.requires}
      </p>
      <p>{ending.outcome}</p>
      {ending.cost !== undefined && (
        <p>
          <strong>{t('Cost')}:</strong> {ending.cost}
        </p>
      )}
      {ending.epilogue !== undefined && (
        <blockquote className="dmb-aloud">
          {ending.epilogue.split(/\n+/u).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </blockquote>
      )}
    </div>
  );
}

/** The ways the campaign can end, on the first chapter's opening (to steer) and the last one's. */
export function CampaignEndings({
  book,
  chapter,
}: {
  readonly book: CampaignBook;
  readonly chapter: CampaignBookChapter;
}) {
  const t = useT();
  const endings = book.endings ?? [];
  const first = book.chapters[0]?.number;
  const last = book.chapters[book.chapters.length - 1]?.number;
  if (endings.length === 0 || (chapter.number !== first && chapter.number !== last)) return null;
  return (
    <details className="dmb-secret">
      <summary>{t('How the campaign can end')}</summary>
      {endings.map((ending) => (
        <Ending key={ending.title} ending={ending} />
      ))}
    </details>
  );
}
