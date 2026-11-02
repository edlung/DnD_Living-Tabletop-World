import type { RollEntry, RollGroup } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { listenForUnlock, playImpacts, type Impact } from './audio.ts';
import type { DiceEngine, DieRequest, Landing } from './engine/index.ts';
import { animates, useDiceSettings, type DiceSettings } from './settings.ts';
import { useDiceTable } from './table.tsx';
import {
  purposeWords,
  resultWords,
  rollerWords,
  rollMarks,
  subjectWords,
  sumWords,
} from './words.ts';

/** A throw without motion still knocks: a short tumble of impacts. */
const STILL_TUMBLE: readonly Impact[] = [
  { time: 0, speed: 12, pan: 0.2, withDie: false },
  { time: 0.11, speed: 9, pan: 0.1, withDie: false },
  { time: 0.21, speed: 7, pan: -0.05, withDie: true },
  { time: 0.31, speed: 5, pan: -0.1, withDie: false },
  { time: 0.39, speed: 3, pan: -0.12, withDie: false },
  { time: 0.45, speed: 2, pan: -0.12, withDie: false },
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

/** What `promise` gives within `ms`, else null: a slow engine never holds a roll's numbers back. */
const within = <T,>(promise: Promise<T | null>, ms: number): Promise<T | null> =>
  Promise.race([promise, wait(ms).then(() => null)]);

/** The engine's first load (a chunk, textures, shaders) may take this long before a roll goes on. */
const ENGINE_WAIT_MS = 2500;
/** A throw lasts at most five seconds (`engine/simulate.ts`); past this the plate tells the numbers. */
const LANDING_WAIT_MS = 5500;

const requestsOf = (group: RollGroup): DieRequest[] =>
  group.dice.map((die) => ({
    sides: die.sides,
    value: die.value,
    ...(die.dropped ? { dropped: true } : {}),
  }));

function canUseWebGl(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** What the plate shows: the roll, how many of its throws have landed, and where. */
interface Shown {
  readonly entry: RollEntry;
  readonly landed: number;
  readonly at: Landing | null;
  readonly leaving: boolean;
}

/**
 * The dice on the screen (Stage 510): every roll new to this perspective is thrown across the whole
 * screen in the top layer (above an open dialog), lands on the server's values with the sound of its
 * bounces, and leaves a plate with the sum and what came of it. Rolls queue; motion follows the
 * viewer's setting (reduced motion shows the plate and keeps the sound). Without WebGL, with an
 * engine still loading or a page out of sight, the plate tells the numbers without the throw
 * (Stage 540: a CI runner's software GL never held them back again). Decorative: the roll is
 * announced in words by `RollAnnouncer`.
 */
export function DiceStage({ onAnnounce }: { readonly onAnnounce: (words: RollEntry) => void }) {
  const t = useT();
  const table = useDiceTable();
  const settings = useDiceSettings();
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Promise<DiceEngine | null> | null>(null);
  const [queue, setQueue] = useState<readonly RollEntry[]>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  const settingsRef = useRef<DiceSettings>(settings);
  settingsRef.current = settings;
  const playing = useRef(false);

  useEffect(() => listenForUnlock(), []);
  useEffect(
    () => () => {
      void engine.current?.then((loaded) => {
        loaded?.dispose();
      });
    },
    [],
  );
  useEffect(() => {
    if (!table || table.fresh.length === 0) return;
    setQueue((queued) => [...queued, ...table.fresh]);
    table.takeFresh();
  }, [table?.fresh]);

  const loadEngine = () => {
    const element = canvas.current;
    if (!element || !canUseWebGl()) return Promise.resolve(null);
    engine.current ??= import('./engine/index.ts')
      .then((module) => module.createDiceEngine(element))
      .catch(() => null);
    return engine.current;
  };

  useEffect(() => {
    const entry = queue[0];
    if (!entry || playing.current) return;
    playing.current = true;
    const play = async () => {
      const element = layer.current;
      // Re-shown on each roll, so it lies above a dialog opened since.
      if (element?.matches(':popover-open')) element.hidePopover();
      element?.showPopover();
      // Who rolled and for what show at once; a hidden page draws no frames, so it throws none.
      setShown({ entry, landed: 0, at: null, leaving: false });
      // Dice already thrown on the table (their faces entered, ADR 0044 §4) are not thrown again.
      const flies = !(entry.entered ?? false);
      const motion = flies && animates(settingsRef.current) && !document.hidden;
      const loaded = motion ? await within(loadEngine(), ENGINE_WAIT_MS) : null;
      const set = entry.hidden || entry.roller === null ? 'ivory' : 'obsidian';
      let at: Shown['at'] = null;
      for (const [index, group] of entry.groups.entries()) {
        setShown({ entry, landed: index, at, leaving: false });
        const sound = settingsRef.current;
        if (loaded && group.dice.length > 0) {
          const thrown = loaded.throw(requestsOf(group), set);
          if (sound.sound) playImpacts(thrown.hits, sound.volume);
          at = await within(thrown.landed, LANDING_WAIT_MS);
        } else {
          if (flies && sound.sound && group.dice.length > 0) {
            playImpacts(STILL_TUMBLE, sound.volume);
          }
          await wait(450);
        }
        setShown({ entry, landed: index + 1, at, leaving: false });
        if (index + 1 < entry.groups.length) await wait(900);
      }
      // Landed: the roll joins the log and is said in words; the plate stays a moment.
      table?.land(entry.rollId);
      onAnnounce(entry);
      await wait(2600);
      setShown({ entry, landed: entry.groups.length, at, leaving: true });
      await wait(450);
      loaded?.clear();
      setShown(null);
      element?.hidePopover();
      playing.current = false;
      setQueue((queued) => queued.slice(1));
    };
    void play();
  }, [queue]);

  // The plate keeps clear of the dice: above them where there is room, else below.
  const above = shown?.at ? shown.at.top > 220 : false;
  const plate = shown && (
    <div
      className={`dice-plate${shown.leaving ? ' is-leaving' : ''}${shown.at ? ` is-placed ${above ? 'is-above' : 'is-below'}` : ''}`}
      style={
        shown.at
          ? {
              left: `${String(Math.round(Math.min(Math.max(shown.at.x, 190), window.innerWidth - 190)))}px`,
              top: `${String(Math.round(above ? shown.at.top - 12 : shown.at.bottom + 12))}px`,
            }
          : undefined
      }
    >
      <p className="dice-plate-who">
        <span>{rollerWords(t, shown.entry.roller)}</span>
        <span>{subjectWords(t, shown.entry.subject)}</span>
        {rollMarks(t, shown.entry, table?.isDm ?? false).map((mark) => (
          <span key={mark} className="dice-plate-mark">
            {mark}
          </span>
        ))}
      </p>
      {shown.entry.groups.slice(0, shown.landed).map((group, index) => {
        const result = resultWords(t, group);
        return (
          <p key={index} className={`dice-plate-line dice-plate-line--${group.purpose}`}>
            <span className="dice-plate-purpose">{purposeWords(t, group)}</span>
            <span className="dice-plate-sum">{sumWords(group)}</span>
            {result && (
              <span
                className={`dice-plate-result is-${group.critical ? 'critical' : (group.result ?? '')}`}
              >
                {result}
              </span>
            )}
          </p>
        );
      })}
    </div>
  );

  return (
    <div ref={layer} popover="manual" className="dice-layer" aria-hidden="true">
      <canvas ref={canvas} className="dice-canvas" />
      {plate}
    </div>
  );
}
