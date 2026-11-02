import type { Translate } from './i18n.tsx';

/**
 * Presentation of contract tokens only; no rule values are derived here. The readable
 * English form is the translation key, so a token such as `ambush-survived` reads
 * "Ambush Survived" and has a Russian entry of its own.
 */
export function readableLabel(value: string, t?: Translate): string {
  const label = value
    .split(/[-_]/u)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return t ? t(label) : label;
}

export function readableList(values: readonly string[], t?: Translate): string {
  return values.length === 0
    ? (t?.('None recorded') ?? 'None recorded')
    : values.map((value) => readableLabel(value, t)).join(', ');
}

/** What `combatantLabels` reads of an encounter: who fights, where, and in which order. */
export interface LabelledEncounter {
  readonly order: readonly string[];
  readonly combatants: readonly {
    readonly entity: { readonly entityId: string; readonly name: string | null };
    readonly position: { readonly x: number; readonly y: number };
    /** An object the party attacks (docs/adr/0048-hit-points.md §5). */
    readonly object?: unknown;
  }[];
}

/**
 * The label of every combatant of an encounter (docs/STAGE_320_DESIGN.md §5.5): its name when
 * the perspective's projection carries one, else "Unidentified creature N" — or "Unidentified
 * object N" for a thing in the fight — never its ID. The unnamed are numbered in turn order, then
 * by position (row, then column) for any the order does not list, so the same fight keeps the
 * same numbers on every screen and refresh.
 */
export function combatantLabels(
  encounter: LabelledEncounter,
  t: Translate,
): ReadonlyMap<string, string> {
  const turn = new Map(encounter.order.map((entityId, index) => [entityId, index]));
  const unnamed = encounter.combatants
    .filter((combatant) => combatant.entity.name === null)
    .toSorted(
      (a, b) =>
        (turn.get(a.entity.entityId) ?? Infinity) - (turn.get(b.entity.entityId) ?? Infinity) ||
        a.position.y - b.position.y ||
        a.position.x - b.position.x,
    );
  const numberIn = (things: typeof unnamed) =>
    new Map(things.map((combatant, index) => [combatant.entity.entityId, index + 1]));
  const creatures = numberIn(unnamed.filter((combatant) => combatant.object === undefined));
  const objects = numberIn(unnamed.filter((combatant) => combatant.object !== undefined));
  return new Map(
    encounter.combatants.map((combatant) => {
      const { entityId, name } = combatant.entity;
      const label =
        combatant.object === undefined
          ? t('Unidentified creature {number}', { number: creatures.get(entityId) ?? 1 })
          : t('Unidentified object {number}', { number: objects.get(entityId) ?? 1 });
      return [entityId, name ?? label];
    }),
  );
}
