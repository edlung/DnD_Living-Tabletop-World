import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  ELOWEN,
  PLAYER,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import type { Actor } from '../kernel/actor.ts';
import {
  dialogueSourceIds,
  npcDialogueContext,
  sharedSources,
  type NpcDialogueContext,
} from './dialogue-context.ts';
import { checkTalk } from './talk.ts';
import { NPC_PLACE, boundaryWorld, type BoundaryNpc } from './testing/boundary.ts';

/**
 * What an NPC has already said (owner decisions 11, SI-N1; ADR 0020 §3 amendment): whether it
 * met this character, from the recorded events naming both, per character; what it told, per
 * the speaker's scope. The exchange's own command never counts, an undone one never counts,
 * another NPC's conversation never counts, and the trace cites the events it rests on.
 */
const ORIN = 'orin-stonebeard';
const MIRA = 'mira-vale';
const BRAN = 'bran-ironfoot';
const SYMBOL = 'feature-19c7c7f7';
const SYMBOL_EVIDENCE = 'party-symbol-evidence';
const PRIOR_INCIDENT = 'Orin recognized the same symbol after a caravan vanished last spring.';

interface Build {
  readonly topicId?: string;
  readonly justShared?: readonly string[];
  /** This exchange's command, whose events must not count. */
  readonly exchange?: string | null;
  readonly characterId?: string;
  readonly actor?: Actor;
  /** Trace IDs of its earlier spoken replies to this character. */
  readonly earlierReplies?: readonly string[];
}

async function contextFor(
  world: InvestigationWorld,
  npcId: string,
  options: Build = {},
): Promise<NpcDialogueContext> {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('no campaign');
  const talk = checkTalk(
    snapshot.state,
    options.actor ?? PLAYER,
    options.characterId ?? ELOWEN,
    npcId,
  );
  if (!talk.ok) throw new Error(`cannot talk: ${talk.code}`);
  const context = npcDialogueContext(snapshot.state, {
    speaker: talk.speaker,
    npcId,
    topicId: options.topicId ?? null,
    justShared: options.justShared ?? [],
    conversation: {
      history: snapshot.history,
      exchangeCommandId: options.exchange ?? null,
      ...(options.earlierReplies ? { earlierReplies: options.earlierReplies } : {}),
    },
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
  return {
    commandId: asked.commandId ?? null,
    shared: sharedSources(snapshot?.history ?? [], asked.commandId ?? ''),
  };
}

const told = (context: NpcDialogueContext) =>
  context.mayTell.filter((line) => line.toldBefore).map((line) => line.text);

describe('whether the NPC has spoken with this character', () => {
  it('a first meeting: not met, nothing told before, nothing cited', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    const context = await contextFor(world, ORIN);
    expect(context.metBefore).toBe(false);
    expect(context.metOn).toEqual([]);
    expect(told(context)).toEqual([]);
    expect(dialogueSourceIds(context).some((id) => id.startsWith('event#'))).toBe(false);
  });

  it('the Orin scene: shown and asked, then talked to again, he has met her and told her', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    await show(world);
    const asked = await ask(world, ORIN, SYMBOL);
    expect(asked.shared).toEqual(['orin-prior-incident']);

    // The asking exchange: met already (the showing), the answer just told, not before.
    const asking = await contextFor(world, ORIN, {
      topicId: SYMBOL,
      justShared: asked.shared,
      exchange: asked.commandId,
    });
    expect(asking.metBefore).toBe(true);
    expect(asking.metOn).toHaveLength(1);
    expect(asking.justTold.map((line) => line.text)).toEqual([PRIOR_INCIDENT]);
    expect(told(asking)).toEqual([]);

    // A minute later, plain talk: the showing and the sharing, cited; told first.
    const talking = await contextFor(world, ORIN);
    expect(talking.metBefore).toBe(true);
    expect(talking.metOn).toHaveLength(2);
    expect(dialogueSourceIds(talking)).toEqual(
      expect.arrayContaining(talking.metOn.map((id) => `event#${id}`)),
    );
    expect(talking.mayTell[0]).toMatchObject({
      text: PRIOR_INCIDENT,
      toldBefore: true,
      aboutTopic: false,
    });

    const again = await contextFor(world, ORIN, { topicId: SYMBOL });
    expect(again.mayTell.filter((line) => line.aboutTopic).map((line) => line.text)).toEqual([
      PRIOR_INCIDENT,
    ]);
  });

  it('the exchange itself does not count: a first showing is not an earlier meeting', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    const shown = await show(world);
    expect((await contextFor(world, ORIN, { exchange: shown.commandId ?? null })).metBefore).toBe(
      false,
    );
    expect((await contextFor(world, ORIN)).metBefore).toBe(true);
  });

  it('one snapshot: whoever it told is told, and that one has met it', async () => {
    const world = await withEvidence();
    await enter(world, MIRA);
    const first = await ask(world, MIRA, 'guild-caravan');
    const after = await contextFor(world, MIRA, {
      topicId: 'guild-caravan',
      justShared: first.shared,
      exchange: first.commandId,
    });
    expect(after.metBefore).toBe(false);
    expect(told(after)).toEqual([]);
    const later = await contextFor(world, MIRA);
    expect(later.metBefore).toBe(true);
    expect(told(later).length).toBeGreaterThan(0);
  });

  it('an Insight attempt on the NPC counts, as its own recorded exchange', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    world.roll(2); // a failed check is recorded all the same
    await world.submit({ type: 'InsightCheck', characterId: ELOWEN, npcId: ORIN, topicId: SYMBOL });
    expect((await contextFor(world, ORIN)).metBefore).toBe(true);
  });

  it('an undone exchange does not count', async () => {
    const world = await withEvidence();
    await enter(world, MIRA);
    const asked = await ask(world, MIRA, 'guild-caravan');
    expect((await contextFor(world, MIRA)).metBefore).toBe(true);
    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: asked.commandId },
      DM,
    );
    expect(undone.status).toBe('accepted');
    const context = await contextFor(world, MIRA);
    expect(context.metBefore).toBe(false);
    expect(told(context)).toEqual([]);
  });

  it('per character: a companion who never met her is told by the party, but not met', async () => {
    const world = await withEvidence();
    await enter(world, MIRA);
    await world.submit(
      {
        type: 'CreateEntity',
        entityId: BRAN,
        kind: 'character',
        name: 'Bran Ironfoot',
        existsSince: null,
        placement: { locationId: NPC_PLACE[MIRA], since: null },
      },
      DM,
    );
    await world.submit(
      { type: 'AssignCharacter', characterId: BRAN, playerActorId: 'player-bran' },
      DM,
    );
    await ask(world, MIRA, 'guild-caravan');

    const elowen = await contextFor(world, MIRA);
    const bran = await contextFor(world, MIRA, { characterId: BRAN, actor: DM });
    expect(elowen.metBefore).toBe(true);
    expect(bran.speaker.name).toBe('Bran Ironfoot');
    expect(bran.metBefore).toBe(false);
    expect(bran.metOn).toEqual([]);
    // What it told is the party's: the same lines, told before.
    expect(told(bran)).toEqual(told(elowen));
    expect(told(bran).length).toBeGreaterThan(0);
  });

  it('another NPC’s conversation never counts, and its records never enter', async () => {
    const world = await withEvidence();
    await enter(world, MIRA);
    const { shared } = await ask(world, MIRA, 'guild-caravan');
    expect(shared.length).toBeGreaterThan(0);

    await enter(world, ORIN);
    const orin = await contextFor(world, ORIN);
    expect(orin.metBefore).toBe(false);
    expect(told(orin)).toEqual([]);
    const all = JSON.stringify(orin);
    for (const sourceId of shared) expect(all).not.toContain(sourceId);
  });

  /*
   * Stage 360 second stand-in pass (player 38): what is told now is never "already told"; and
   * (player 11, 25, 26) a conversation of plain Talk is remembered from its own spoken replies.
   */
  it('what the exchange’s own command shares is just told, even when the caller passes nothing', async () => {
    const world = await withEvidence();
    await enter(world, MIRA);
    const asked = await ask(world, MIRA, 'guild-caravan');
    expect(asked.shared.length).toBeGreaterThan(0);
    const context = await contextFor(world, MIRA, {
      topicId: 'guild-caravan',
      exchange: asked.commandId,
    });
    expect(told(context)).toEqual([]);
    expect(context.justTold.map((line) => line.sourceId)).toEqual(asked.shared);
  });

  it('after evidence is shown, what it unlocks is new to them, not already told', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    await show(world);
    const talking = await contextFor(world, ORIN);
    expect(talking.metBefore).toBe(true);
    expect(talking.mayTell).toContainEqual(
      expect.objectContaining({ text: PRIOR_INCIDENT, toldBefore: false }),
    );
    expect(told(talking)).toEqual([]);
  });

  it('its own earlier spoken replies to this character count as having met, cited by trace', async () => {
    const world = await withEvidence();
    await enter(world, ORIN);
    const first = await contextFor(world, ORIN);
    expect(first.metBefore).toBe(false);
    const replies = ['t-1', 't-2', 't-3', 't-4', 't-5'];
    const again = await contextFor(world, ORIN, { earlierReplies: replies });
    expect(again.metBefore).toBe(true);
    expect(again.metOn).toEqual([]);
    expect(again.repliedOn).toEqual(['t-2', 't-3', 't-4', 't-5']);
    expect(dialogueSourceIds(again)).toEqual(expect.arrayContaining(['trace#t-5']));
    // Only that it spoke counts: nothing it said is told, nothing new is sayable.
    expect(told(again)).toEqual([]);
    expect(again.mayTell).toEqual(first.mayTell);
  });
});
