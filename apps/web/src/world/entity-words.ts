import type { EntityKind, EntityStatus } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * What the client calls an entity the perspective sees unnamed, the same in the scene, its
 * details and its actions: a place and a creature have their own words ("Unidentified location",
 * as the places list says; "Unidentified creature", as the battlefield says), every other kind
 * "Unidentified <kind>".
 */
export function unidentifiedName(t: Translate, kind: EntityKind): string {
  if (kind === 'location') return t('Unidentified location');
  if (kind === 'creature') return t('Unidentified creature');
  return t('Unidentified {kind}', { kind: t(kind) });
}

const LIVING: ReadonlySet<EntityKind> = new Set(['character', 'npc', 'creature']);

/** An entity's status as the scene shows it: `active` is "alive" only for the living. */
export function statusWord(t: Translate, kind: EntityKind, status: EntityStatus): string {
  return status === 'active' && !LIVING.has(kind) ? t('in place') : t(status);
}
