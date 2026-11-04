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
  return rolls.filter((roll) => !roll.hidden && !seen.has(roll.rollId)).slice(-AT_ONCE);
}
