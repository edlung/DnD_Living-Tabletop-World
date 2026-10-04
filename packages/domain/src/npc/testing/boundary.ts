import npcBoundary from '../../../../../fixtures/ravenford/npc-boundary.json' with { type: 'json' };
import { submissionsFromScript } from '../../kernel/engine/script.ts';
import {
  CAMPAIGN,
  DM,
  investigationWorld,
  type InvestigationWorld,
} from '../../investigation/testing/world.ts';

/**
 * Test support: the full Ravenford seed plus the Gate 04 dialogue boundary
 * markers (`fixtures/ravenford/npc-boundary.json`), planted by the DM.
 */
export const NPC_BOUNDARY = npcBoundary;
export const BOUNDARY_NPCS = ['mira-vale', 'orin-stonebeard', 'captain-thorne'] as const;
export type BoundaryNpc = (typeof BOUNDARY_NPCS)[number];

/** Where each NPC stands in the seed. */
export const NPC_PLACE: Readonly<Record<BoundaryNpc, string>> = {
  'mira-vale': 'market-square',
  'orin-stonebeard': 'orins-alchemy',
  'captain-thorne': 'north-gate',
};

export async function boundaryWorld(): Promise<InvestigationWorld> {
  const world = await investigationWorld();
  for (const submission of submissionsFromScript({
    campaignId: CAMPAIGN,
    actor: DM,
    commands: npcBoundary.commands,
    commandIdPrefix: `${CAMPAIGN}.npc-boundary`,
  })) {
    const result = await world.engine.execute(submission);
    if (result.status === 'rejected') {
      throw new Error(`npc boundary rejected: ${result.code} ${JSON.stringify(result.details)}`);
    }
  }
  return world;
}

/** Text no context for `npcId` may ever contain. */
export const neverSaidBy = (npcId: BoundaryNpc): string[] => [
  ...npcBoundary.neverSaid['*'],
  ...npcBoundary.neverSaid[npcId],
];
