import {
  checkTalk,
  dialogueSourceIds,
  npcDialogueContext,
  type NpcDialogueContext,
} from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { dialoguePrompt, dialogueRequest, type Exchange } from './dialogue-prompt.ts';
import { replyLocally } from './local-dialogue.ts';
import { CAMPAIGN, DM, NPC_BOUNDARY, PLAYER, seedRavenford } from './testing/ravenford.ts';

/**
 * The rendered NPC-dialogue request (ADR 0020 §3; owner decisions 11, SI-N1): an NPC that has
 * spoken with the speaker is told so and what it already said, apart from what it may still
 * tell; the instructions ask it not to re-introduce itself, to stay consistent, and to speak
 * from its own role instead of volunteering common advice. No ID reaches the text.
 */
const line = (sourceId: string, text: string) => ({ sourceId, text });
const PRIOR = 'Orin recognized the same symbol after a caravan vanished last spring.';
const SHOP = 'The shop opens at dawn.';
const LODGING = 'Rooms are let at the Golden Stag.';

const orin = (met: boolean): NpcDialogueContext => ({
  npc: { entityId: 'orin-stonebeard', kind: 'npc', name: 'Orin Stonebeard' },
  speaker: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen Starwhisper' },
  metBefore: met,
  metOn: met ? ['00000000-0000-4000-8000-000000000001'] : [],
  repliedOn: [],
  attitude: 'NEUTRAL',
  worldTime: 36_000,
  place: { entityId: 'orins-alchemy', kind: 'location', name: "Orin's Alchemy" },
  around: [],
  topic: { entityId: 'feature-19c7c7f7', kind: 'feature', name: 'Strange Symbol' },
  justTold: [],
  mayTell: [
    ...(met ? [{ ...line('orin-prior-incident', PRIOR), toldBefore: true, aboutTopic: true }] : []),
    { ...line('orin-willing', SHOP), toldBefore: false, aboutTopic: false },
  ],
  common: [line('golden-stag-rooms', LODGING)],
  memories: [],
  shown: [{ entityId: 'feature-19c7c7f7', kind: 'feature', name: 'Strange Symbol' }],
  guarded: [{ entityId: 'feature-19c7c7f7', kind: 'feature', name: 'Strange Symbol' }],
});

const render = (
  context: NpcDialogueContext,
  intent: 'talk' | 'ask',
  exchange: Partial<Exchange> = {},
) =>
  dialogueRequest(
    dialoguePrompt(context, { intent, accepted: true, line: null, ...exchange }),
    null,
  );

describe('the NPC-dialogue request', () => {
  it('asked again by someone it has met: what it already told, apart, and "again"', () => {
    const request = render(orin(true), 'ask');
    expect(request.prompt).toMatchInlineSnapshot(`
      "<npc_context>
      You are Orin Stonebeard.
      How you feel about the party: neutral.
      World time: Day 1 10:00:00.
      Where you are: Orin's Alchemy.
      Speaking with you: Elowen Starwhisper.
      You have spoken with them before; they know who you are.
      They have shown you evidence about: Strange Symbol.
      You have already told them or their companions:
      - Orin recognized the same symbol after a caravan vanished last spring.
      You have not told them this yet; you may tell them now:
      - The shop opens at dawn.
      Everyone around here knows (background: bring it up only if asked or it concerns you):
      - Rooms are let at the Golden Stag.
      Guarded topics (you know something about them that you will not share now): Strange Symbol.
      </npc_context>
      <exchange>
      They ask you again about Strange Symbol; you have already told them what you would.
      </exchange>"
    `);
    for (const id of ['orin-stonebeard', 'orin-prior-incident', 'golden-stag-rooms']) {
      expect(request.prompt).not.toContain(id);
    }
  });

  it('a first meeting says so, and keeps nothing as told', () => {
    const request = render(orin(false), 'talk');
    expect(request.prompt).toContain('You do not recall speaking with them before.');
    expect(request.prompt).not.toContain('You have already told them');
    expect(request.prompt).toContain('They talk with you.');
  });

  it('instructs no re-introduction, consistency, and its own role over common advice', () => {
    const { system } = render(orin(true), 'talk');
    expect(system).toContain(
      'If you have spoken with them before, do not introduce yourself again or greet them as a stranger.',
    );
    expect(system).toContain('never deny or take back what you have already told them');
    expect(system).toContain('Stay consistent with what you have already told them');
    expect(system).toContain(
      'Do not volunteer common knowledge or general advice, such as where to lodge, unless they ask for it or it is your own trade.',
    );
    expect(system).not.toContain('you have nothing to tell about them here');
  });

  it('an NPC the speaker knows unnamed does not claim they know who it is', () => {
    const unnamed = { ...orin(true), npc: { ...orin(true).npc, name: null } };
    const { prompt } = render(unnamed, 'talk');
    expect(prompt).toContain('You have spoken with them before, but they do not know your name.');
    expect(prompt).not.toContain('they know who you are');
  });

  it('"again" only for an ask that was accepted or had nothing new, not another rejection', () => {
    const again = 'They ask you again about Strange Symbol';
    expect(render(orin(true), 'ask', { accepted: false, rejection: 'NO_EFFECT' }).prompt).toContain(
      again,
    );
    const refused = { accepted: false, rejection: 'ENTITY_NOT_FOUND' } as const;
    expect(render(orin(true), 'ask', refused).prompt).not.toContain(again);
    const local = (exchange: Partial<Exchange>) =>
      replyLocally(
        dialoguePrompt(orin(true), { intent: 'ask', accepted: true, line: null, ...exchange }),
      ).reply;
    expect(local({ accepted: false, rejection: 'NO_EFFECT' })).toContain(`As I told you: ${PRIOR}`);
    expect(local(refused)).not.toContain('As I told you');
  });
});

describe('the planted secrets through the real render (Gate 04 markers)', () => {
  it('Orin, trusted and shown the symbol, every topic asked: told lines, never a secret or ID', async () => {
    const world = await seedRavenford({ dialogue: true });
    let n = 0;
    const submit = (command: Record<string, unknown>, actor = PLAYER) =>
      world.engine.execute({
        commandId: `prompt-test.${String((n += 1))}`,
        campaignId: CAMPAIGN,
        actor,
        command,
      });
    await submit(
      {
        type: 'AddKnowledge',
        knowledgeId: 'nb-prompt-symbol',
        scope: { kind: 'PARTY' },
        knowledgeType: 'EVIDENCE',
        statement: 'A strange symbol is burned into a wagon plank.',
        subjects: ['feature-19c7c7f7'],
        knownSince: null,
      },
      DM,
    );
    const ORIN = 'orin-stonebeard';
    const ELOWEN = 'elowen-starwhisper';
    await submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'orins-alchemy' });
    await submit({ type: 'SetRelationship', npcId: ORIN, attitude: 'TRUSTED' }, DM);
    await submit({
      type: 'ShowEvidence',
      characterId: ELOWEN,
      npcId: ORIN,
      knowledgeId: 'nb-prompt-symbol',
    });
    const topics = ['feature-19c7c7f7', 'guild-caravan', 'old-trade-road', 'captain-thorne'];
    for (const topicId of topics) {
      await submit({ type: 'AskAbout', characterId: ELOWEN, npcId: ORIN, topicId });
    }
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('no campaign');
    const talk = checkTalk(snapshot.state, PLAYER, ELOWEN, ORIN);
    if (!talk.ok) throw new Error(talk.code);
    const never = [...NPC_BOUNDARY.neverSaid['*'], ...NPC_BOUNDARY.neverSaid[ORIN]];
    for (const topicId of [null, ...topics]) {
      const context = npcDialogueContext(snapshot.state, {
        speaker: talk.speaker,
        npcId: ORIN,
        topicId,
        justShared: [],
        conversation: { history: snapshot.history, exchangeCommandId: null },
      });
      if (!context) throw new Error('no context');
      const request = render(context, topicId === null ? 'talk' : 'ask', {
        accepted: false,
        rejection: 'NO_EFFECT',
      });
      const sent = `${request.system}\n${request.prompt}`;
      expect(sent).toContain('You have spoken with them before; they know who you are.');
      expect(sent).toContain('You have already told them or their companions:');
      for (const marker of never) expect(sent, marker).not.toContain(marker);
      for (const id of dialogueSourceIds(context).filter(
        (id) => id.includes('#') || id.includes('-'),
      )) {
        expect(sent, id).not.toContain(id.replace(/^event#/, ''));
      }
    }
  });
});
