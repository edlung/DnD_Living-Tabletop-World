import { describe, expect, it } from 'vitest';

import { CAMPAIGN, DM, ELOWEN, PLAYER } from '../investigation/testing/world.ts';
import { dialogueSourceIds, npcDialogueContext, sharedSources } from './dialogue-context.ts';
import { checkTalk } from './talk.ts';
import {
  BOUNDARY_NPCS,
  NPC_PLACE,
  boundaryWorld,
  neverSaidBy,
  type BoundaryNpc,
} from './testing/boundary.ts';

/**
 * How an NPC talks (docs/adr/0020-npc-intelligence.md, amendment 2026-11-14): its own public
 * manner of speech reaches its context and the trace as `manner#<npcId>`; another NPC's manner,
 * its description and every planted secret never do.
 */
const HIDDEN_NPC = 'npc-2c4cf6cd';
const MANNER: Readonly<Record<BoundaryNpc, string>> = {
  'mira-vale': 'MANNERMIRA: quick and warm, finishes your sentences.',
  'orin-stonebeard': 'MANNERORIN: gruff, measures every word like a reagent.',
  'captain-thorne': 'MANNERTHORNE: speaks briefly, as if reading out an order.',
};
/** Another NPC's manner, which no boundary NPC may speak from. */
const HIDDEN_MANNER = 'MANNERSABLE: whispers, never finishes a sentence.';

async function mannered() {
  const world = await boundaryWorld();
  for (const npcId of BOUNDARY_NPCS) {
    const result = await world.submit(
      { type: 'UpdateEntityProfile', entityId: npcId, manner: MANNER[npcId] },
      DM,
    );
    expect(result.status).toBe('accepted');
  }
  const hidden = await world.submit(
    { type: 'UpdateEntityProfile', entityId: HIDDEN_NPC, manner: HIDDEN_MANNER },
    DM,
  );
  expect(hidden.status).toBe('accepted');
  return world;
}

describe('an NPC speaks in its own manner, and only its own', () => {
  for (const npcId of BOUNDARY_NPCS) {
    it(`${npcId}: its manner, never another's, its description or a secret`, async () => {
      const world = await mannered();
      await world.submit({
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId: NPC_PLACE[npcId],
      });
      for (const topicId of [null, 'feature-19c7c7f7', 'old-trade-road']) {
        let justShared: string[] = [];
        if (topicId !== null) {
          const asked = await world.submit({
            type: 'AskAbout',
            characterId: ELOWEN,
            npcId,
            topicId,
          });
          const snapshot = await world.engine.load(CAMPAIGN);
          justShared = sharedSources(snapshot?.history ?? [], asked.commandId ?? '');
        }
        const state = await world.state();
        const talk = checkTalk(state, PLAYER, ELOWEN, npcId);
        if (!talk.ok) throw new Error(`cannot talk: ${talk.code}`);
        const context = npcDialogueContext(state, {
          speaker: talk.speaker,
          npcId,
          topicId,
          justShared,
        });
        if (!context) throw new Error('no context');

        expect(context.manner).toBe(MANNER[npcId]);
        expect(dialogueSourceIds(context)).toContain(`manner#${npcId}`);
        const text = JSON.stringify(context);
        const description = state.entities.get(npcId)?.description ?? '';
        if (description !== '') expect(text).not.toContain(description);
        for (const other of [...Object.values(MANNER), HIDDEN_MANNER])
          if (other !== MANNER[npcId]) expect(text).not.toContain(other);
        for (const marker of neverSaidBy(npcId)) expect(text, marker).not.toContain(marker);
      }
    });
  }

  it('an NPC without a manner has none, and the trace cites none', async () => {
    const world = await boundaryWorld();
    await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'orins-alchemy' });
    const state = await world.state();
    const talk = checkTalk(state, PLAYER, ELOWEN, 'orin-stonebeard');
    if (!talk.ok) throw new Error(`cannot talk: ${talk.code}`);
    const context = npcDialogueContext(state, {
      speaker: talk.speaker,
      npcId: 'orin-stonebeard',
      topicId: null,
      justShared: [],
    });
    if (!context) throw new Error('no context');
    expect(context.manner).toBeNull();
    expect(dialogueSourceIds(context).some((id) => id.startsWith('manner#'))).toBe(false);
  });
});
