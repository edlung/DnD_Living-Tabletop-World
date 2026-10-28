import { checkTalk, npcDialogueContext, sharedSources, type NpcDialogueContext } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { dialoguePrompt, dialogueRequest, type Exchange } from './dialogue-prompt.ts';
import { replyLocally } from './local-dialogue.ts';
import { CAMPAIGN, DM, PLAYER, seedRavenford } from './testing/ravenford.ts';

/*
 * Stage 360 second stand-in pass (owner decisions 11, round 2). DM 36–37, 41: Tomas, created by
 * the DM with a recorded testimony and no disclosure choice, said he had not seen the caravan.
 * His testimony is GUARDED by default (ADR 0020 §2), so it is withheld: only its subject reaches
 * the context, as a guarded topic. The instructions now say a guarded topic is something it
 * knows and will not share, so it may decline or deflect but never deny or claim not to know.
 * Player 38: the line it may tell after evidence is new, never "already told". Player 39: one
 * form of address in Russian.
 */
const TOMAS = 'tomas-gatewatch';
const ELOWEN = 'elowen-starwhisper';
const CARAVAN = 'guild-caravan';
const TESTIMONY = 'Tomas saw the caravan leave through the north gate at dawn.';

async function tomasWorld() {
  const world = await seedRavenford({ dialogue: true });
  let n = 0;
  const submit = async (command: Record<string, unknown>, actor = PLAYER) => {
    const result = await world.engine.execute({
      commandId: `guarded-test.${String((n += 1))}`,
      campaignId: CAMPAIGN,
      actor,
      command,
    });
    return result;
  };
  // What the authoring proposal carried in the stand-in pass: the NPC and its testimony, nothing more.
  await submit(
    {
      type: 'CreateEntity',
      entityId: TOMAS,
      kind: 'npc',
      name: 'Tomas',
      description: 'A gate watchman.',
      existsSince: null,
      placement: { locationId: 'north-gate', since: null },
    },
    DM,
  );
  await submit(
    {
      type: 'AddKnowledge',
      knowledgeId: 'tomas-testimony',
      scope: { kind: 'NPC', npcId: TOMAS },
      knowledgeType: 'TESTIMONY',
      statement: TESTIMONY,
      subjects: [CARAVAN],
      attributedTo: TOMAS,
      knownSince: null,
    },
    DM,
  );
  const entered = await submit({
    type: 'EnterLocation',
    characterId: ELOWEN,
    locationId: 'north-gate',
  });
  if (entered.status !== 'accepted') throw new Error(`enter: ${JSON.stringify(entered)}`);
  return { world, submit };
}

async function contextOf(
  world: Awaited<ReturnType<typeof seedRavenford>>,
  topicId: string | null,
  exchangeCommandId: string | null = null,
): Promise<NpcDialogueContext> {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('no campaign');
  const talk = checkTalk(snapshot.state, PLAYER, ELOWEN, TOMAS);
  if (!talk.ok) throw new Error(talk.code);
  const context = npcDialogueContext(snapshot.state, {
    speaker: talk.speaker,
    npcId: TOMAS,
    topicId,
    justShared: exchangeCommandId ? sharedSources(snapshot.history, exchangeCommandId) : [],
    conversation: { history: snapshot.history, exchangeCommandId },
  });
  if (!context) throw new Error('no context');
  return context;
}

const request = (context: NpcDialogueContext, exchange: Exchange) =>
  dialogueRequest(dialoguePrompt(context, exchange), null);

describe('an NPC never denies what it knows', () => {
  it('a DM-created NPC’s testimony, with no disclosure chosen, is withheld as a guarded topic', async () => {
    const { world, submit } = await tomasWorld();
    const asked = await submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: TOMAS,
      topicId: CARAVAN,
    });
    expect(asked).toMatchObject({ status: 'rejected', code: 'NO_EFFECT' });
    const context = await contextOf(world, CARAVAN, asked.commandId ?? null);
    expect(context.guarded.map((entity) => entity.entityId)).toEqual([CARAVAN]);
    expect(context.mayTell).toEqual([]);

    const sent = request(context, {
      intent: 'ask',
      accepted: false,
      rejection: 'NO_EFFECT',
      line: null,
    });
    const text = `${sent.system}\n${sent.prompt}`;
    // Gate 04: the withheld content never enters, only that it is guarded.
    expect(text).not.toContain(TESTIMONY);
    expect(sent.prompt).toContain(
      'Guarded topics (you know something about them that you will not share now): Merchant Guild caravan.',
    );
    expect(sent.prompt).toContain(
      'They ask you about Merchant Guild caravan, a guarded topic: you know something about it that you will not share now.',
    );
    expect(sent.system).toContain(
      'never claim you know nothing about it, never say you did not see or hear it',
    );
    expect(sent.system).toContain('neither in your context nor a guarded topic');
    // The local voice declines rather than denies.
    expect(replyLocally(dialoguePrompt(context, { ...exchangeOf('ask') })).reply).toContain(
      'Merchant Guild caravan is not something I will discuss.',
    );
  });

  it('plain talk with the DM’s line about the topic: the same rule', async () => {
    const { world } = await tomasWorld();
    const sent = request(await contextOf(world, null), {
      ...exchangeOf('talk'),
      line: 'What do you know about the caravan?',
    });
    expect(sent.prompt).toContain('Guarded topics (you know something about them');
    expect(sent.prompt).not.toContain(TESTIMONY);
  });

  it('once the DM lets him share it, he tells it as new, not as already told', async () => {
    const { world, submit } = await tomasWorld();
    await submit(
      { type: 'SetDisclosure', knowledgeId: 'tomas-testimony', disclosure: 'WILLING' },
      DM,
    );
    const talk = await contextOf(world, null);
    expect(talk.guarded).toEqual([]);
    const sent = request(talk, exchangeOf('talk'));
    expect(sent.prompt).toContain(
      `You have not told them this yet; you may tell them now:\n- ${TESTIMONY}`,
    );
    expect(sent.prompt).not.toContain('You have already told them');
    expect(sent.system).toContain(
      'Say you have already told them something only if it is listed as already told',
    );
  });
});

describe('one form of address', () => {
  it('Russian replies keep «вы»; English is unaffected', async () => {
    const { world } = await tomasWorld();
    const context = await contextOf(world, null);
    const ru = request(context, { ...exchangeOf('talk'), language: 'ru' });
    expect(ru.system).toContain('«вы» in every sentence of every reply, and never switch to «ты»');
    const en = request(context, exchangeOf('talk'));
    expect(en.system).not.toContain('«вы»');
  });
});

function exchangeOf(intent: 'talk' | 'ask'): Exchange {
  return intent === 'ask'
    ? { intent, accepted: false, rejection: 'NO_EFFECT', line: null }
    : { intent, accepted: true, line: null };
}
