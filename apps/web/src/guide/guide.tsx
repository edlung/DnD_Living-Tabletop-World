import { useT, type Translate } from '@ltw/ui';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';

/**
 * The first-session guide (docs/adr/0044-online-play.md §8): what the screens are, how the world
 * is explored, how a turn goes, how to roll and how to talk — five short pages for a new player,
 * from "How to play" in the top bar. A native modal dialog: focus stays inside, Escape closes it
 * and focus returns to the button. Nothing of the world is in it.
 */
interface Page {
  readonly glyph: GlyphName;
  readonly title: string;
  readonly lines: readonly string[];
}

function pagesOf(t: Translate): readonly Page[] {
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
      ],
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

export function GuideDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useT();
  const ids = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const pages = pagesOf(t);
  const page = pages[index] ?? pages[0];
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setIndex(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  if (!page) return null;
  const last = index === pages.length - 1;
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
      <section className="guide-page" id={`${ids}-page`} aria-live="polite">
        <h3>
          <Glyph name={page.glyph} />
          {page.title}
        </h3>
        {page.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
      <footer className="guide-footer">
        <span className="guide-step">
          {t('Page {number} of {count}', { number: index + 1, count: pages.length })}
        </span>
        <div className="action-row">
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
            {last ? t('Start playing') : t('Next')}
            {!last && <Glyph name="chevron-right" />}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
