import dayTwo from '../../../../../fixtures/ravenford/day-two.json' with { type: 'json' };
import { assetWorld, type AssetWorld } from '../../assets/testing/world.ts';
import { CAMPAIGN, DM, ELOWEN, PLAYER } from '../../authoring/testing/world.ts';
import { submissionsFromScript } from '../../kernel/engine/script.ts';
import { worldTimeAt } from '../../kernel/world-time.ts';
import { holderPerspective, type ResolvedPerspective } from '../../knowledge/perspective.ts';
import type { Snapshot } from '../views.ts';

/**
 * Test support for world visual state (docs/adr/0023-world-visual-state.md):
 * the asset world, the Ravenford Day 2 script (`fixtures/ravenford/day-two.json`),
 * perspectives, and snapshots to resolve views from.
 */
export const DAY1 = worldTimeAt(1, 10);
export const DAY1_NIGHT = worldTimeAt(1, 22);
export const DAY2 = worldTimeAt(2, 10);
export const DM_VIEW: ResolvedPerspective = {
  label: 'DM',
  kind: 'DM',
  holderId: null,
  scopes: 'ALL',
};

export interface VisualWorld extends AssetWorld {
  readonly snapshot: () => Promise<Snapshot>;
  readonly elowen: () => Promise<ResolvedPerspective>;
  readonly party: () => Promise<ResolvedPerspective>;
  /** Runs the Day 2 script: clear skies on Day 1, then Day 2 10:00 and rain. */
  readonly dayTwo: () => Promise<void>;
  readonly enter: (locationId: string) => Promise<void>;
  readonly dm: (command: Record<string, unknown>) => Promise<void>;
}

export async function visualWorld(): Promise<VisualWorld> {
  const world = await assetWorld();
  const snapshot = async () => {
    const loaded = await world.engine.load(CAMPAIGN);
    if (!loaded) throw new Error('missing campaign');
    return loaded;
  };
  const dm = async (command: Record<string, unknown>) => {
    const result = await world.as(DM, command);
    if (result.status !== 'accepted') throw new Error(`${String(command['type'])} rejected`);
  };
  return {
    ...world,
    snapshot,
    elowen: async () =>
      holderPerspective((await snapshot()).state, { kind: 'CHARACTER', characterId: ELOWEN }),
    party: async () => holderPerspective((await snapshot()).state, { kind: 'PARTY' }),
    dayTwo: async () => {
      for (const submission of submissionsFromScript({
        campaignId: CAMPAIGN,
        actor: DM,
        commands: dayTwo.commands,
        commandIdPrefix: `${CAMPAIGN}.day-two`,
      })) {
        const result = await world.engine.execute(submission);
        if (result.status === 'rejected') throw new Error(`day two rejected: ${result.code}`);
      }
    },
    enter: async (locationId) => {
      const result = await world.as(PLAYER, {
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId,
      });
      if (result.status !== 'accepted') throw new Error(`enter ${locationId} rejected`);
    },
    dm,
  };
}
