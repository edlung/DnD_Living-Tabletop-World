import type { RollEntry, RollGroup } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cueFor, playCue } from '../audio/cues.ts';
import { nativeHaptic } from '../native/signals.ts';
import { listenForUnlock, playImpacts, type Impact } from './audio.ts';
import type { DiceEngine, DieRequest, Landing } from './engine/index.ts';
import { animates, useDiceSettings } from './settings.ts';
import { DiceFaces } from './dice-faces.tsx';
import {
  purposeWords,
  resultWords,
  rollerWords,
  rollMarks,
  subjectWords,
  sumWords,
  tableResult,
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

/** Presents one authoritative roll at a time. The caller owns its queue and its audience. */
export function RollPlayback({
  entry,
  screen = false,
  isDm = false,
  onLanded,
  onDone,
}: {
  readonly entry: RollEntry | null;
  readonly screen?: boolean;
  readonly isDm?: boolean;
  readonly onLanded?: (entry: RollEntry) => void;
  readonly onDone: (entry: RollEntry) => void;
}) {
  const t = useT();
  const settings = useDiceSettings();
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Promise<DiceEngine | null> | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const latest = useRef({ settings, onLanded, onDone });
  latest.current = { settings, onLanded, onDone };

  useEffect(() => listenForUnlock(), []);
  useEffect(
    () => () => {
      const held = engine.current;
      engine.current = null;
      void held?.then((loaded) => {
        loaded?.dispose();
      });
    },
    [],
  );
  const loadEngine = useCallback(() => {
    const element = canvas.current;
    if (!element) return Promise.resolve(null);
    if (!engine.current && canUseWebGl()) {
      engine.current = import('./engine/index.ts')
        .then((module) => module.createDiceEngine(element))
        .catch(() => null);
    }
    return engine.current ?? Promise.resolve(null);
  }, []);
  // Once the DM enables the overlay the TV can load its artwork and renderer behind the scene.
  useEffect(() => {
    if (screen && !document.hidden && animates(settings)) void loadEngine();
  }, [loadEngine, screen, settings]);

  useEffect(() => {
    const element = layer.current;
    if (!entry || !element) return;
    const run = new AbortController();
    const halted = () => run.signal.aborted;
    let activeEngine: DiceEngine | null = null;
    const play = async () => {
      const flies = !entry.entered;
      const motion = flies && animates(latest.current.settings) && !document.hidden;
      const open = () => {
        element.showPopover();
        setShown({ entry, landed: 0, at: null, leaving: false });
      };
      if (!screen) open();
      const loaded = motion ? await within(loadEngine(), ENGINE_WAIT_MS) : null;
      if (halted()) return;
      if (screen) open();
      activeEngine = loaded;
      const set = entry.hidden || entry.roller === null ? 'ivory' : 'obsidian';
      const shared =
        !entry.hidden &&
        !entry.private &&
        entry.roller !== null &&
        element.closest("[data-campaign-theme='lighthouse']") !== null;
      let at: Shown['at'] = null;
      for (const [index, group] of entry.groups.entries()) {
        setShown({ entry, landed: index, at, leaving: false });
        const sound = latest.current.settings;
        if (loaded && group.dice.length > 0) {
          try {
            const key = shared ? entry.rollId + '/' + String(index) : undefined;
            const thrown = loaded.throw(requestsOf(group), set, key);
            element.setAttribute('data-rolling', '');
            if (sound.sound) playImpacts(thrown.hits, sound.volume);
            at = await within(thrown.landed, LANDING_WAIT_MS);
          } catch {
            // A TV can lose its WebGL context in mid-throw. The recorded result is still available.
            at = null;
          }
        } else if (!screen) {
          if (flies && sound.sound && group.dice.length > 0)
            playImpacts(STILL_TUMBLE, sound.volume);
          await wait(450);
        }
        if (halted()) return;
        if (!screen && flies && sound.sound && group.dice.length > 0) nativeHaptic('dice');
        setShown({ entry, landed: index + 1, at, leaving: false });
        if (sound.sound) playCue(cueFor(entry, index), sound.volume);
        if (index + 1 < entry.groups.length) await wait(900);
        if (halted()) return;
      }
      latest.current.onLanded?.(entry);
      await wait(2600);
      if (halted()) return;
      setShown({ entry, landed: entry.groups.length, at, leaving: true });
      await wait(450);
      if (!halted()) latest.current.onDone(entry);
    };
    void play();
    return () => {
      run.abort();
      activeEngine?.clear();
      element.removeAttribute('data-rolling');
      if (element.matches(':popover-open')) element.hidePopover();
      setShown(null);
    };
  }, [entry, screen, loadEngine]);

  // The plate keeps clear of the dice: above them where there is room, else below.
  const above = shown?.at ? shown.at.top > 220 : false;
  const lastGroup = shown?.entry.groups[shown.landed - 1];
  const plate = shown && (
    <div
      className={`dice-plate${shown.leaving ? ' is-leaving' : ''}${shown.at ? ` is-placed ${above ? 'is-above' : 'is-below'}` : ''}`}
      style={
        shown.at && !screen
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
        {rollMarks(t, shown.entry, isDm).map((mark) => (
          <span key={mark} className="dice-plate-mark">
            {mark}
          </span>
        ))}
      </p>
      {screen && lastGroup && <DiceFaces group={lastGroup} />}
      {shown.entry.groups.slice(0, shown.landed).map((group, index) => {
        const result = resultWords(t, group);
        return (
          <p
            key={index}
            className={`dice-plate-line dice-plate-line--${group.purpose}`}
            data-cue={cueFor(shown.entry, index) ?? undefined}
          >
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
      {shown.landed >= shown.entry.groups.length && tableResult(shown.entry) !== null && (
        <p className="dice-plate-line dice-table-result">{tableResult(shown.entry)}</p>
      )}
    </div>
  );

  return (
    <div
      ref={layer}
      popover="manual"
      className={screen ? 'dice-layer display-dice-stage' : 'dice-layer'}
      data-roll={screen ? shown?.entry.rollId : undefined}
      data-landed={screen && shown && shown.landed === shown.entry.groups.length ? '' : undefined}
      aria-hidden={screen ? undefined : true}
      role={screen ? 'status' : undefined}
    >
      <canvas ref={canvas} className="dice-canvas" aria-hidden="true" />
      {plate}
    </div>
  );
}
