import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  ELOWEN,
  PLAYER,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import type { WorldState } from '../kernel/state.ts';
import { npcDialogueContext, sharedSources, type NpcDialogueContext } from './dialogue-context.ts';
import { checkTalk } from './talk.ts';
import { NPC_PLACE, boundaryWorld, type BoundaryNpc } from './testing/boundary.ts';

/**
 * What an NPC has already said to the speaker (owner decisions 11, SI-N1; ADR 0020 §3
 * amendment): whether they have spoken before and which of its records it has told,
 * only from its own recorded acts toward the speaker's scope. The exchange itself never
 * counts, another NPC's conversation never counts, and nothing outside the Gate 04
 * boundary enters through it.
 */
const ORIN = 'orin-stonebeard';
const MIRA = 'mira-vale';
const SYMBOL = 'feature-19c7c7f7';
const SYMBOL_EVIDENCE = 'party-symbol-evidence';
const PRIOR_INCIDENT = 'Orin recognized the same symbol after a caravan vanished last spring.';

async function contextFor(
  world: InvestigationWorld,
  npcId: string,
  options: { topicId?: string; justShared?: readonly string[]; priorState?: WorldState } = {},
): Promise<NpcDialogueContext> {
  const state = await world.state();
  const talk = checkTalk(state, PLAYER, ELOWEN, npcId);
  if (!talk.ok) throw new Error(`cannot talk: ${talk.code}`);
  const context = npcDialogueContext(state, {
    speaker: talk.speaker,
    npcId,
    topicId: options.topicId ?? null,
    justShared: options.justShared ?? [],
    ...(options.priorState ? { priorState: options.priorState } : {}),
  });
  if (!context) throw new Error('no context');
  return context;
}

async function withEvidence(): Promise<InvestigationWorld> {
  const world = await boundaryWorld();
  await world.submit(
    {
      type: 'AddKnowledge',
      knowledgeId: SYMBOL_EVIDENCE,
      scope: { kind: 'PARTY' },
      knowledgeType: 'EVIDENCE',
      statement: 'A strange symbol is burned into the abandoned wagon.',
      subjects: [SYMBOL],
      knownSince: null,
    },
    DM,
  );
  return world;
}

const enter = (world: InvestigationWorld, npcId: BoundaryNpc) =>
  world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: NPC_PLACE[npcId] });

const show = (world: InvestigationWorld) =>
  world.submit({
    type: 'ShowEvidence',
    characterId: ELOWEN,
    npcId: ORIN,
    knowledgeId: SYMBOL_EVIDENCE,
  });

async function ask(world: InvestigationWorld, npcId: string, topicId: string) {
  const asked = await world.submit({ type: 'AskAbout', characterId: ELOWEN, npcId, topicId });
  const snapshot = await world.engine.load(CAMPAIGN);
  return sharedSources(snapshot?.history ?? [], asked.commandId ?? '');
}

const told = (context: NpcDialogueContext) =>
  context.mayTell.filter((line) => line.toldBefore).map((line) => line.text);

describe('whether the NPC has spoken with the speaker', () => {
  it('a first meeting: not met, nothing told before', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    const context = await contextFor(world, ORIN);
    expect(context.metBefore).toBe(false);
    expect(told(context)).toEqual([]);
  });

  it('the Orin scene: shown and asked, then talked to again, he has met her and told her', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    await show(world);
    const beforeAsk = await world.state();
    const justShared = await ask(world, ORIN, SYMBOL);
    expect(justShared).toEqual(['orin-prior-incident']);

    // The asking exchange: met already (the showing), the answer just told, not before.
    const asking = await contextFor(world, ORIN, {
      topicId: SYMBOL,
      justShared,
      priorState: beforeAsk,
    });
    expect(asking.metBefore).toBe(true);
    expect(asking.justTold.map((line) => line.text)).toEqual([PRIOR_INCIDENT]);
    expect(told(asking)).toEqual([]);

    // A minute later, plain talk: told before, listed first, and not about a topic.
    const talking = await contextFor(world, ORIN);
    expect(talking.metBefore).toBe(true);
    expect(talking.mayTell[0]).toMatchObject({
      text: PRIOR_INCIDENT,
      toldBefore: true,
      aboutTopic: false,
    });
    expect(talking.mayTell.find((line) => !line.toldBefore)?.text).toBe(
      'NBXORINWILLING: the shop opens at dawn.',
    );

    // Asked again about the symbol: nothing new is shared, and he knows what he told.
    const again = await contextFor(world, ORIN, { topicId: SYMBOL });
    expect(again.justTold).toEqual([]);
    expect(again.mayTell.filter((line) => line.aboutTopic).map((line) => line.text)).toEqual([
      PRIOR_INCIDENT,
    ]);
  });

  it('the exchange itself does not count: a first showing is not an earlier meeting', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    const before = await world.state();
    await show(world);
    expect((await contextFor(world, ORIN, { priorState: before })).metBefore).toBe(false);
    // Without the prior state the showing would read as an earlier meeting.
    expect((await contextFor(world, ORIN)).metBefore).toBe(true);
  });

  it('an Insight attempt on the NPC counts, as its own recorded exchange', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    world.roll(2); // a failed check is recorded all the same
    await world.submit({ type: 'InsightCheck', characterId: ELOWEN, npcId: ORIN, topicId: SYMBOL });
    expect((await contextFor(world, ORIN)).metBefore).toBe(true);
  });

  it('another NPC’s conversation never counts, and its records never enter', async () => {
    const world = await withEvidence();
    await enter(world, MIRA);
    const shared = await ask(world, MIRA, 'guild-caravan');
    expect(shared.length).toBeGreaterThan(0);
    expect((await contextFor(world, MIRA)).metBefore).toBe(true);

    await enter(world, ORIN);
    const orin = await contextFor(world, ORIN);
    expect(orin.metBefore).toBe(false);
    expect(told(orin)).toEqual([]);
    const ids = JSON.stringify(orin);
    for (const sourceId of shared) expect(ids).not.toContain(sourceId);
  });
});
