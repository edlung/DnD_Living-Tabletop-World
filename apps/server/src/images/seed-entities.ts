import type { RecordedEvent } from '@ltw/domain';

import type { CuratedEntry, CuratedSet } from './curated-set.ts';

/**
 * Curated pictures of entities a seed command creates with an ID the World Engine draws in every
 * copy of a campaign (a ready-made character, `CreateCharacter`: docs/adr/0058-campaign-content.md
 * §5). The manifest names such an entity by the seed command that creates it,
 * `seed-<prefix>-<NNNN>` (the seed script's prefix and position, `ravenford-seed.ts`), and a copy
 * binds that name to the ID its own history recorded before the pictures are imported.
 */
const SEED_ENTITY = /^seed-([a-z][a-z0-9-]*)-(\d{4})$/;
const SEED_COMMAND = /\.([a-z][a-z0-9-]*)\.(\d{4})$/;

/** Each seed name of a copy's history: the entity its seed command created first. */
export function seededEntityIds(history: readonly RecordedEvent[]): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  for (const event of history) {
    if (event.type !== 'EntityCreated') continue;
    const match = SEED_COMMAND.exec(event.causation.commandId);
    if (!match) continue;
    const name = `seed-${match[1] ?? ''}-${match[2] ?? ''}`;
    if (!ids.has(name)) ids.set(name, event.payload.entityId);
  }
  return ids;
}

/**
 * The set with every seed name replaced by the copy's entity; a name the copy did not record is
 * dropped (its picture is skipped, as one of an entity the campaign lacks).
 */
export function bindSeedEntities(set: CuratedSet, ids: ReadonlyMap<string, string>): CuratedSet {
  const bind = (entry: CuratedEntry): CuratedEntry => ({
    ...entry,
    entityIds: entry.entityIds.flatMap((entityId) => {
      if (!SEED_ENTITY.test(entityId)) return [entityId];
      const bound = ids.get(entityId);
      return bound === undefined ? [] : [bound];
    }),
  });
  return { ...set, entries: set.entries.map(bind) };
}
