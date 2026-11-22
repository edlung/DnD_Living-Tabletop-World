import type { CampaignBookPage } from '@ltw/contracts';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { runsOf, type TextRun } from './model.ts';

/**
 * A leaf's text in screens that turn (docs/adr/0074-dm-book.md §3.6): the text is cut into
 * sentences, and as many as fit the page's height are shown. On a narrow screen, where the page
 * grows with its text, everything is one screen. Words that open something are buttons.
 */
export interface Passage {
  /** Words to read aloud are set as a quotation. */
  readonly aloud: boolean;
  readonly text: string;
}

const SENTENCE = /[^.!?…]+(?:[.!?…]+["»”)]*|$)\s*/gu;
const sentencesOf = (text: string) =>
  text.match(SENTENCE)?.filter((part) => part.trim() !== '') ?? [text];

interface Unit {
  readonly passage: number;
  readonly aloud: boolean;
  readonly text: string;
}
function unitsOf(passages: readonly Passage[]): Unit[] {
  return passages.flatMap((passage, index) =>
    passage.text.split(/\n{2,}/u).flatMap((paragraph, part) =>
      sentencesOf(paragraph).map((text) => ({
        // A paragraph of a passage is its own block.
        passage: index * 1000 + part,
        aloud: passage.aloud,
        text,
      })),
    ),
  );
}

/** Units grouped back into paragraphs, each with its runs. */
function blocksOf(units: readonly Unit[]) {
  const blocks: { key: number; aloud: boolean; text: string }[] = [];
  for (const unit of units) {
    const last = blocks.at(-1);
    if (last?.key === unit.passage) last.text += unit.text;
    else blocks.push({ key: unit.passage, aloud: unit.aloud, text: unit.text });
  }
  return blocks;
}

function Blocks({
  units,
  render,
}: {
  readonly units: readonly Unit[];
  readonly render: (text: string) => ReactNode;
}) {
  return (
    <>
      {blocksOf(units).map((block) =>
        block.aloud ? (
          <blockquote key={block.key}>
            <p>{render(block.text.trim())}</p>
          </blockquote>
        ) : (
          <p key={block.key}>{render(block.text.trim())}</p>
        ),
      )}
    </>
  );
}

export function PageText({
  passages,
  page,
  screen,
  onScreens,
  onOpen,
  openKey,
}: {
  readonly passages: readonly Passage[];
  /** The page whose links the text carries; null for a chapter's opening. */
  readonly page: CampaignBookPage | null;
  /** The screen of the text shown, from 0. */
  readonly screen: number;
  /** Told how many screens the text takes at this size. */
  readonly onScreens: (count: number) => void;
  readonly onOpen: (opens: NonNullable<TextRun['opens']>, opener: HTMLElement) => void;
  /** The key of what is open now, to mark its words. */
  readonly openKey: string | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const units = unitsOf(passages);
  const signature = units.map((unit) => unit.text).join('\u0001');
  // Where each screen starts, as an index into the units.
  const [starts, setStarts] = useState<readonly number[]>([0]);
  useLayoutEffect(() => {
    const box = frame.current;
    const probe = measure.current;
    if (!box || !probe) return;
    const fit = () => {
      const room = box.clientHeight;
      const marks = [...probe.querySelectorAll<HTMLElement>('[data-unit]')];
      // A page that grows with its text (a narrow screen) has no height to fit: one screen.
      if (room < 80 || getComputedStyle(box).overflowY === 'visible' || marks.length === 0) {
        setStarts([0]);
        return;
      }
      const next = [0];
      let top = marks[0]?.offsetTop ?? 0;
      marks.forEach((mark, index) => {
        if (index > (next.at(-1) ?? 0) && mark.offsetTop + mark.offsetHeight - top > room) {
          next.push(index);
          top = mark.offsetTop;
        }
      });
      setStarts((current) => (current.join() === next.join() ? current : next));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    // A font that arrives late changes the copy's height, not the frame's.
    watch.observe(probe);
    return () => {
      watch.disconnect();
    };
  }, [signature]);
  useLayoutEffect(() => {
    onScreens(starts.length);
  }, [starts.length, onScreens]);

  const shown = Math.min(screen, starts.length - 1);
  const from = starts[shown] ?? 0;
  const visible = units.slice(from, starts[shown + 1] ?? units.length);
  const linked = (text: string) =>
    page === null
      ? text
      : runsOf(page, text).map((run, index) =>
          run.opens ? (
            <button
              // Runs of one text never reorder: their place is their identity.
              key={index}
              type="button"
              className="dmb-link"
              aria-expanded={openKey === run.opens.key}
              onClick={(event) => {
                if (run.opens) onOpen(run.opens, event.currentTarget);
              }}
            >
              {run.text}
            </button>
          ) : (
            run.text
          ),
        );
  return (
    <div className="dmb-text-frame">
      <div ref={frame} className="dmb-text" data-screens={starts.length}>
        <Blocks units={visible} render={linked} />
      </div>
      {/* The same text, each sentence marked, to learn where a screen ends. */}
      <div ref={measure} className="dmb-text dmb-measure" aria-hidden="true">
        {blocksOf(units).map((block) => {
          const own = units
            .map((unit, index) => ({ unit, index }))
            .filter(({ unit }) => unit.passage === block.key);
          const marks = own.map(({ unit, index }) => (
            <span key={index} data-unit={index}>
              {unit.text}
            </span>
          ));
          return block.aloud ? (
            <blockquote key={block.key}>
              <p>{marks}</p>
            </blockquote>
          ) : (
            <p key={block.key}>{marks}</p>
          );
        })}
      </div>
    </div>
  );
}
