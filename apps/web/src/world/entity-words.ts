import type { EntityKind, EntityStatus } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * What the client calls an entity the perspective sees unnamed, the same in the scene, its
 * details, its actions and a conversation: a place and a creature have their own words
 * ("Unidentified location", as the places list says; "Unidentified creature", as the battlefield
 * says), a person is a "Stranger" (Stage 360: a person is never "an unidentified object"), every
 * other kind "Unidentified <kind>".
 */
export function unidentifiedName(t: Translate, kind: EntityKind): string {
  if (kind === 'location') return t('Unidentified location');
  if (kind === 'creature') return t('Unidentified creature');
  if (kind === 'npc' || kind === 'character') return t('Stranger');
  return t('Unidentified {kind}', { kind: t(kind) });
}

const LIVING: ReadonlySet<EntityKind> = new Set(['character', 'npc', 'creature']);

/** An entity's status as the scene shows it: `active` is "alive" only for the living. */
export function statusWord(t: Translate, kind: EntityKind, status: EntityStatus): string {
  return status === 'active' && !LIVING.has(kind) ? t('in place') : t(status);
}

interface Named {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string;
}

/**
 * Names that tell apart the entities of one directory (Stage 360): the name alone while no other
 * entity there has it; with its kind where one of another kind has it ("Merchant Guild
 * (faction)"); with a number, in directory order, where one of the same kind has it too ("Goblin
 * raider 2"). Where the kind is shown beside the name (`kindShown`), only the number is added.
 * Labels are computed over the whole directory, so one entity reads the same in every list.
 */
export function distinctNames(
  t: Translate,
  directory: readonly Named[],
  { kindShown = false }: { readonly kindShown?: boolean } = {},
): ReadonlyMap<string, string> {
  const byName = new Map<string, Named[]>();
  for (const entity of directory) {
    byName.set(entity.name, [...(byName.get(entity.name) ?? []), entity]);
  }
  const labels = new Map<string, string>();
  for (const [name, same] of byName) {
    const kinds = new Set(same.map((entity) => entity.kind));
    for (const entity of same) {
      const ofKind = same.filter((other) => other.kind === entity.kind);
      const kindWord = !kindShown && kinds.size > 1 ? ` (${t(entity.kind)})` : '';
      const number = ofKind.length > 1 ? ` ${String(ofKind.indexOf(entity) + 1)}` : '';
      labels.set(entity.entityId, `${name}${kindWord}${number}`);
    }
  }
  return labels;
}
