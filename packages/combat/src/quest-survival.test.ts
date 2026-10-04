import { questBookSchema } from '@ltw/contracts';
import { holderPerspective, questLog } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import questBook from '../../../fixtures/ravenford/quests.json' with { type: 'json' };
import { CAMPAIGN, ELOWEN, roadWorld, startAmbush } from './testing/road.ts';

/**
 * The quest's "survived the ambush" milestone (ADR 0025 §2) counts only a
 * fight a party member came out of alive.
 */
const QUESTS = questBookSchema.parse(questBook).quests;

async function stagesAfterTheFight(elowenDies: boolean) {
  const world = await roadWorld();
  await startAmbush(world);
  if (elowenDies) await world.dm({ type: 'ChangeEntityStatus', entityId: ELOWEN, status: 'dead' });
  const encounterId = (await world.encounter()).encounterId;
  expect((await world.dm({ type: 'EndCombat', encounterId })).status).toBe('accepted');
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  const party = holderPerspective(snapshot.state, { kind: 'PARTY' });
  return questLog(snapshot, party, QUESTS)[0]?.transitions.map((t) => t.stage) ?? [];
}

describe('surviving the ambush', () => {
  it('is a milestone when a party member walks away', async () => {
    expect(await stagesAfterTheFight(false)).toContain('ambush-survived');
  });

  it('is no milestone when nobody of the party survives', async () => {
    expect(await stagesAfterTheFight(true)).not.toContain('ambush-survived');
  });

  it('counts no return from what came before the fight in the same instant', async () => {
    const world = await roadWorld();
    // Elowen steps into Orin's shop, then the DM sets the ambush on the road: all at one world time.
    expect(
      (await world.dm({ type: 'PlaceEntity', entityId: ELOWEN, locationId: 'orins-alchemy' }))
        .status,
    ).toBe('accepted');
    await startAmbush(world);
    const encounterId = (await world.encounter()).encounterId;
    await world.dm({ type: 'EndCombat', encounterId });
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    const stages =
      questLog(
        snapshot,
        holderPerspective(snapshot.state, { kind: 'PARTY' }),
        QUESTS,
      )[0]?.transitions.map((t) => t.stage) ?? [];
    expect(stages).toContain('ambush-survived');
    expect(stages).not.toContain('returned');
  });
});
