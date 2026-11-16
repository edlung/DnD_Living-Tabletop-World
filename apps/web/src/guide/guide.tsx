import { useT, type Translate } from '@ltw/ui';
import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';

import { TextSizeChoice } from '../comforts/text-size.tsx';
import { useRulesApi } from '../rules/reference-data.ts';
import { useScreenRequest } from '../shell/requests.ts';
import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { useScrollEdges } from '../visual/scroll-edges.ts';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { dmPagesOf } from './dm-guide.ts';
import { OurTable } from './our-table.tsx';

/**
 * The first-session guide (docs/adr/0044-online-play.md §8): what the screens are, how the world
 * is explored, how a turn goes, how to roll and how to talk — five short pages for a new player,
 * from "How to play" in the top bar. A native modal dialog: focus stays inside, Escape closes it
 * and focus returns to the button. Nothing of the world is in it. Since Stage 740
 * (docs/adr/0071-memory-and-ritual.md §4) the guide is by role — the DM has "How to run the game"
 * beside the players' pages — and ends, for everyone, with "Our table": the table's agreement.
 */
export interface GuidePage {
  readonly glyph: GlyphName;
  readonly title: string;
  readonly lines: readonly string[];
  /** The page ends with the choice of this screen's text size. */
  readonly textSize?: true;
}

function pagesOf(t: Translate): readonly GuidePage[] {
  return [
    {
      glyph: 'live',
      title: t('Your screens'),
      lines: [
        t('The DM runs the game from a laptop or an iPad.'),
        t(
          'The table’s screen — a TV, or every screen when you play online — shows what the whole party sees.',
        ),
        t(
          'Your phone is your character: the sheet, your dice, the journal and the places you know.',
        ),
        // The viewer's text size (docs/adr/0072-keepsakes.md §3): chosen where a newcomer reads first.
        t('If the words are small, make them larger here, or later in Dice:'),
      ],
      textSize: true,
    },
    {
      glyph: 'look',
      title: t('Exploring'),
      lines: [
        t('Choose a person, a thing or a way out in the scene to see what you can do there.'),
        t(
          'Talk, look closer, use an item or travel. What your character learns goes to the Journal.',
        ),
      ],
    },
    {
      glyph: 'initiative',
      title: t('Your turn in a fight'),
      lines: [
        t('When a fight starts, the order of turns is rolled for everyone.'),
        t(
          'On your turn your phone tells you. Choose a creature or a square on the battlefield, then an action under it.',
        ),
        t('Move, act, and press End turn when you are done.'),
      ],
    },
    {
      glyph: 'roll',
      title: t('Rolling dice'),
      lines: [
        t('The app rolls for you when you act, and everyone sees the dice.'),
        t('When the DM asks for a check it waits in Dice: press Roll.'),
        t('If the DM lets the table use real dice, roll yours and enter what they show.'),
      ],
    },
    {
      glyph: 'ask',
      title: t('Talking'),
      lines: [
        t('Talk to the table in Chat, as your character or out of character.'),
        t(
          'Or say it without words: Dice and Chat have a row of emoji — applause, a laugh — that the whole table sees for a moment.',
        ),
        t('Send the DM a word only they read. The DM can answer you alone.'),
        t('Your phone tells you whenever the table waits for you.'),
      ],
    },
  ];
}

/** "How to play": opens the guide; the top bar has one on a phone's title row and one beside its controls. */
export function GuideButton({
  className,
  onOpen,
}: {
  readonly className: string;
  readonly onOpen: () => void;
}) {
  const t = useT();
  return (
    <IconButton
      glyph="info"
      label={t('How to play')}
      labelled
      className={className}
      aria-haspopup="dialog"
      onClick={onOpen}
    />
  );
}

type Part = 'players' | 'dm';

export function GuideDialog({
  open,
  dm = false,
  onOpen,
  onClose,
}: {
  readonly open: boolean;
  /** The reader runs this campaign: the guide opens on the DM's pages. */
  readonly dm?: boolean;
  /** Another corner of the screen asks for the guide (the DM's first-evening list). */
  readonly onOpen?: () => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const ids = useId();
  const api = useRulesApi();
  const ref = useRef<HTMLDialogElement>(null);
  const [part, setPart] = useState<Part>(dm ? 'dm' : 'players');
  const [index, setIndex] = useState(0);
  useScreenRequest(
    'dm-guide',
    useCallback(() => {
      onOpen?.();
    }, [onOpen]),
  );
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPart(dm ? 'dm' : 'players');
      setIndex(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, dm]);
  const pages = part === 'dm' ? dmPagesOf(t) : pagesOf(t);
  // One page more than the part's own: "Our table", where there is a campaign to read it from.
  const count = pages.length + (api ? 1 : 0);
  const page = pages[index] ?? null;
  const last = index === count - 1;
  const title = page?.title ?? t('Our table');
  // A page longer than its screen says so at its edge (a cut without a fade reads as the end).
  const body = useRef<HTMLElement>(null);
  const edges = useScrollEdges(body, `${String(open)}:${title}`, 'y');
  return (
    <dialog
      ref={ref}
      className="guide-dialog"
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-page`}
      onClose={onClose}
    >
      <header className="guide-header">
        <h2 id={`${ids}-title`}>{t('How to play')}</h2>
        <IconButton glyph="close" label={t('Close the guide')} onClick={onClose} />
      </header>
      {dm && (
        <div className="guide-parts" role="group" aria-label={t('Whose pages')}>
          {(['dm', 'players'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={part === choice}
              onClick={() => {
                setPart(choice);
                setIndex(0);
              }}
            >
              {choice === 'dm' ? t('For the DM') : t('For players')}
            </button>
          ))}
        </div>
      )}
      <section
        ref={body}
        className="guide-page"
        data-more-before={edges.before || undefined}
        data-more-after={edges.after || undefined}
        id={`${ids}-page`}
        aria-live="polite"
        aria-labelledby={`${ids}-page-title`}
        // It may scroll on a short screen: the keyboard reaches it.
        tabIndex={0}
      >
        <h3 id={`${ids}-page-title`}>
          <Glyph name={page?.glyph ?? 'ask'} />
          {title}
        </h3>
        {page
          ? page.lines.map((line) => <p key={line}>{line}</p>)
          : api && open && <OurTable api={api} dm={dm} onLeave={onClose} />}
        {page?.textSize && <TextSizeChoice id={`${ids}-text-size`} />}
      </section>
      <footer className="guide-footer">
        <span className="guide-step">
          {t('Page {number} of {count}', { number: index + 1, count })}
        </span>
        <div className="action-row">
          {api && !last && (
            <button
              type="button"
              onClick={() => {
                setIndex(count - 1);
              }}
            >
              {t('Our table')}
            </button>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={() => {
                setIndex(index - 1);
              }}
            >
              <Glyph name="chevron-left" />
              {t('Back')}
            </button>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (last) onClose();
              else setIndex(index + 1);
            }}
          >
            {last ? (dm ? t('Close') : t('Start playing')) : t('Next')}
            {!last && <Glyph name="chevron-right" />}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
