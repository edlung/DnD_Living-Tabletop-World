import type { CastResponse, RollEntry } from '@ltw/contracts';

/**
 * The table screen's moments (docs/adr/0059-atmosphere.md §4–5), as pure rules: what makes a cast
 * another — a new one fades in, a battlefield's zoom or focus does not — and which rolls are new
 * to the screen, to show big.
 */
export function castKey(cast: CastResponse): string {
  const shown = cast.cast;
  switch (shown.kind) {
    case 'scene':
      return `scene:${cast.place ?? ''}`;
    case 'title':
      return `title:${shown.title}\n${shown.subtitle}`;
    case 'picture':
      return `picture:${shown.entityId}`;
    case 'story':
      return `story:${shown.entityId ?? ''}\n${shown.text}`;
    default:
      return shown.kind;
  }
}

/** Most rolls shown big after one read: an older backlog is only listed. */
export const AT_ONCE = 3;

/**
 * The rolls the table may see that are new since `seen`, oldest first: the latest `AT_ONCE` of
 * them; a hidden roll is never one.
 */
export function freshRolls(rolls: readonly RollEntry[], seen: ReadonlySet<string>): RollEntry[] {
  return rolls
    .filter((roll) => !roll.hidden && !roll.private && !seen.has(roll.rollId))
    .slice(-AT_ONCE);
}

/**
 * A scene cast to "where the party is" follows a fight (docs/adr/0042-table-display.md §3): while
 * the party takes part in one, the screen shows the battlefield, whole and following whoever acts,
 * and the scene again once it is over. A place the DM picked, or any other cast, stays as cast.
 */
export function followedCast(cast: CastResponse, fighting: boolean): CastResponse {
  const shown = cast.cast;
  if (!fighting || shown.kind !== 'scene' || shown.locationId !== null) return cast;
  return {
    ...cast,
    cast: {
      kind: 'battlefield',
      zoom: 1,
      focus: null,
      ...(shown.playerDice3d && { playerDice3d: true }),
    },
  };
}

/** Whether a cast follows a fight, so the screen reads whether the party is in one. */
export const followsFight = (cast: CastResponse): boolean =>
  cast.cast.kind === 'scene' && cast.cast.locationId === null;

/** One line of whom the table waits for: a name, what is asked, and how many times. */
export interface WaitLine {
  readonly key: string;
  readonly who: string;
  readonly what: string;
  readonly times: number;
}

/**
 * The waits as the room reads them: the same ask of the same character once with its count, at
 * most `most` lines, and how many asks the lines leave out — so the strip never grows over the
 * cast it lies on.
 */
export function gatherWaits(
  waits: readonly { readonly who: string; readonly what: string }[],
  most: number,
): { readonly lines: readonly WaitLine[]; readonly more: number } {
  const lines: WaitLine[] = [];
  for (const wait of waits) {
    const key = `${wait.who}\n${wait.what}`;
    const index = lines.findIndex((line) => line.key === key);
    const known = lines[index];
    if (known) lines[index] = { ...known, times: known.times + 1 };
    else lines.push({ key, who: wait.who, what: wait.what, times: 1 });
  }
  const shown = lines.slice(0, Math.max(0, most));
  const told = shown.reduce((sum, line) => sum + line.times, 0);
  return { lines: shown, more: waits.length - told };
}

/**
 * The clatter of a throw that has no cue of its own (damage, free dice, initiative): on the
 * roller's screen the rolling dice are heard; the table's screen has no dice to roll (no WebGL),
 * so it plays a few knocks, one or two a die, dying away — the same synthesized impacts.
 */
export function clatter(dice: number): {
  readonly time: number;
  readonly speed: number;
  readonly pan: number;
  readonly withDie: boolean;
}[] {
  const count = Math.min(Math.max(dice, 1), 6);
  const knocks = Math.min(count * 2, 8);
  return Array.from({ length: knocks }, (_, index) => ({
    time: index * 0.07 + (index % 2) * 0.02,
    speed: 12 * 0.78 ** index,
    pan: ((index * 37) % 100) / 100 - 0.5,
    withDie: count > 1 && index % 3 === 1,
  }));
}
