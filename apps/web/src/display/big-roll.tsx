import type { RollEntry, RollFeedResponse, RollGroup } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { cueFor, playCue } from '../audio/cues.ts';
import { useWaitForSound } from '../audio/sound-on.tsx';
import { useDiceSettings } from '../dice/settings.ts';
import {
  purposeWords,
  resultWords,
  rollerWords,
  subjectWords,
  sumWords,
  tableResult,
} from '../dice/words.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { freshRolls } from './moments.ts';

/** How long a roll shows big, and how long between a roll's throws heard. */
const SHOW_MS = 4500;
const THROW_MS = 700;

/** A throw's dice, each its face and its kind; one not counted, struck through. */
export function DiceFaces({ group }: { readonly group: RollGroup }) {
  if (group.dice.length === 0) return null;
  return (
    <ul className="display-dice-faces" aria-hidden="true">
      {group.dice.map((die, index) => (
        <li key={index} className={die.dropped ? 'is-dropped' : undefined}>
          <span className="display-die-face">{die.value}</span>
          <span className="display-die-sides">d{die.sides}</span>
        </li>
      ))}
    </ul>
  );
}

function Throw({ entry, index }: { readonly entry: RollEntry; readonly index: number }) {
  const t = useT();
  const group = entry.groups[index];
  if (!group) return null;
  const result = resultWords(t, group);
  return (
    <div
      className={`display-big-throw display-big-throw--${group.purpose}`}
      data-cue={cueFor(entry, index) ?? undefined}
    >
      <DiceFaces group={group} />
      <p className="display-big-line">
        <span>{purposeWords(t, group)}</span>
        <strong className="display-big-total">{sumWords(group)}</strong>
        {result && (
          <span
            className={`display-big-result is-${group.critical ? 'critical' : (group.result ?? '')}`}
          >
            {result}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Big dice on the table's screen (docs/adr/0059-atmosphere.md §5): a roll the table may see shows
 * big for a few seconds over the cast — beside the battlefield, a plate in its corner — each die's
 * face, the total, what it was for and what came of it, heard as it shows when the dice's sound is
 * on (§2). Rolls queue; the first read is the table as it was, so nothing in it shows again.
 */
export function BigRoll({
  api,
  refresh,
  compact,
}: {
  readonly api: WorldApi;
  readonly refresh: number;
  readonly compact: boolean;
}) {
  const t = useT();
  const settings = useDiceSettings();
  useWaitForSound('cues', settings.sound);
  const load = useCallback(
    (signal: AbortSignal) => api.get<RollFeedResponse>('rolls', signal),
    [api],
  );
  const feed = useResource('display-big-rolls', load);
  useRereadOn(refresh, feed.reread);
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<readonly RollEntry[]>([]);
  useEffect(() => {
    if (feed.resource.status !== 'ready') return;
    const { rolls } = feed.resource.value;
    if (seen.current === null) {
      seen.current = new Set(rolls.map((roll) => roll.rollId));
      return;
    }
    const known = seen.current;
    const fresh = freshRolls(rolls, known);
    for (const roll of rolls) known.add(roll.rollId);
    if (fresh.length > 0) setQueue((queued) => [...queued, ...fresh]);
  }, [feed.resource]);
  const shown = queue[0] ?? null;
  const sound = useRef(settings);
  sound.current = settings;
  useEffect(() => {
    if (!shown) return;
    const timers = shown.groups.map((_, index) =>
      window.setTimeout(() => {
        if (sound.current.sound) playCue(cueFor(shown, index), sound.current.volume);
      }, index * THROW_MS),
    );
    timers.push(
      window.setTimeout(() => {
        setQueue((queued) => queued.slice(1));
      }, SHOW_MS),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [shown]);
  if (!shown) return null;
  const table = tableResult(shown);
  return (
    <div
      className={compact ? 'display-big-roll is-compact' : 'display-big-roll'}
      role="status"
      data-roll={shown.rollId}
    >
      <p className="display-big-who">
        <span>{rollerWords(t, shown.roller)}</span>
        <span>{subjectWords(t, shown.subject)}</span>
      </p>
      {shown.groups.map((_, index) => (
        <Throw key={index} entry={shown} index={index} />
      ))}
      {table !== null && <p className="display-big-table">{table}</p>}
    </div>
  );
}
