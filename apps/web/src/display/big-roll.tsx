import type { RollEntry, RollFeedResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { cueFor, playCue } from '../audio/cues.ts';
import { useWaitForSound } from '../audio/sound-on.tsx';
import { playImpacts } from '../dice/audio.ts';
import { useDiceSettings } from '../dice/settings.ts';
import { DiceFaces } from '../dice/dice-faces.tsx';
import { RollPlayback } from '../dice/roll-playback.tsx';
import {
  purposeWords,
  resultWords,
  rollerWords,
  subjectWords,
  sumWords,
  tableResult,
} from '../dice/words.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { clatter, freshRolls } from './moments.ts';

/** How long a roll shows big, and how long between a roll's throws heard. */
const SHOW_MS = 4500;
const THROW_MS = 700;

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
 * on (§2): its cue, or for a throw that has none the dice's own clatter. Rolls queue; the first
 * read is the table as it was, so nothing in it shows again.
 */
export function BigRoll({
  api,
  refresh,
  compact,
  playerDice3d,
}: {
  readonly api: WorldApi;
  readonly refresh: number;
  readonly compact: boolean;
  readonly playerDice3d: boolean;
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
  const [queue, setQueue] = useState<readonly { entry: RollEntry; physical: boolean }[]>([]);
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
    if (fresh.length > 0)
      setQueue((queued) => [
        ...queued,
        ...fresh.map((entry) => ({
          entry,
          physical:
            playerDice3d &&
            entry.roller !== null &&
            !entry.entered &&
            entry.groups.some((group) => group.dice.length > 0),
        })),
      ]);
  }, [feed.resource, playerDice3d]);
  useEffect(() => {
    if (!playerDice3d) setQueue((queued) => queued.filter((item) => !item.physical));
  }, [playerDice3d]);
  const current = queue[0];
  const shown = current && !current.physical ? current.entry : null;
  const sound = useRef(settings);
  sound.current = settings;
  useEffect(() => {
    if (!shown) return;
    const timers = shown.groups.map((group, index) =>
      window.setTimeout(() => {
        if (!sound.current.sound) return;
        const cue = cueFor(shown, index);
        // The number plate has no physical collisions to play, so use a short clatter.
        if (cue !== null) playCue(cue, sound.current.volume);
        else if (group.dice.length > 0) {
          playImpacts(clatter(group.dice.length), sound.current.volume);
        }
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
  const table = shown ? tableResult(shown) : null;
  return (
    <>
      {playerDice3d && (
        <RollPlayback
          screen
          entry={current?.physical ? current.entry : null}
          onDone={(entry) => {
            setQueue((queued) => queued.filter((item) => item.entry.rollId !== entry.rollId));
          }}
        />
      )}
      {shown && (
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
      )}
    </>
  );
}
