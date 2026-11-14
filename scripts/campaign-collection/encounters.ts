import type { CampaignEntity, CampaignPackage } from '../../packages/contracts/src/index.ts';
import { foeRoster, isKit, kitEncounter, kitFoes } from '../campaign-shared/combat-kit.ts';
import type { Encounter, Source } from './source.ts';
import { opponent } from './sheets.ts';

export function encounterFoes(s: Source, size: number): CampaignEntity[] {
  return s.encounters.flatMap((e) =>
    isKit(e)
      ? kitFoes(e, size)
      : Array.from({ length: e.foeCount + Math.max(0, size - 6) }, (_, index): CampaignEntity => ({
          key: `${e.key}-foe-${index + 1}`,
          name: `${e.foeName} ${index + 1}`,
          kind: 'creature',
          description: e.foeDescription,
          status: 'active',
          existsSince: null,
          placement: { location: e.location, since: null },
          statBlock: opponent(15 + (size - 5) * 2, 12, 3),
        })),
  );
}
export function buildEncounters(
  s: Source,
  party: readonly string[],
): CampaignPackage['encounters'] {
  const names = new Map(s.cast.heroes.map((hero) => [hero.key, hero.name]));
  const placedParty = [...party].sort((a, b) =>
    (names.get(a) ?? a).localeCompare(names.get(b) ?? b),
  );
  return s.encounters.map((e) =>
    isKit(e)
      ? kitEncounter(e, party)
      : {
          key: e.key,
          title: e.title,
          location: e.location,
          trigger: `${e.trigger} Цель: ${e.objective} Мирный путь: ${e.peaceful} Тактика: ${e.tactics}`,
          battlefield: {
            width: 14,
            height: 12,
            difficult: [
              { x: 6, y: 4 },
              { x: 6, y: 5 },
              { x: 7, y: 4 },
              { x: 7, y: 5 },
            ],
            cover: [
              { x: 8, y: 3, level: 'half' },
              { x: 8, y: 8, level: 'half' },
            ],
          },
          combatants: [
            ...placedParty.map((entity, index) => ({
              entity,
              side: 'party' as const,
              position: { x: 1 + Math.floor(index / 4), y: 2 + (index % 4) },
            })),
            ...Array.from({ length: e.foeCount + Math.max(0, party.length - 6) }, (_, index) => ({
              entity: `${e.key}-foe-${index + 1}`,
              side: 'hostile' as const,
              position: { x: 11 + Math.floor(index / 4), y: 2 + (index % 4) },
            })),
          ],
        },
  );
}

export const foesAt = (e: Encounter, size: number): number =>
  isKit(e) ? foeRoster(e, size).length : e.foeCount + Math.max(0, size - 6);
