import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  ELOWEN,
  PLAYER,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import {
  dialogueSourceIds,
  npcDialogueContext,
  sharedSources,
  type DialogueEntity,
  type DialogueLine,
  type NpcDialogueContext,
} from './dialogue-context.ts';
import { checkTalk } from './talk.ts';
import { boundaryWorld } from './testing/boundary.ts';

/**
 * The minimal NPC context (docs/adr/0020-npc-intelligence.md §3): the Orin
 * scene as Orin may speak it, names the speaker does not know, and the
 * sources a trace records.
 */
const ORIN = 'orin-stonebeard';
const SYMBOL_EVIDENCE = 'party-symbol-evidence';

async function contextFor(
  world: InvestigationWorld,
  npcId: string,
  options: { topicId?: string; justShared?: readonly string[] } = {},
): Promise<NpcDialogueContext> {
  const state = await world.state();
  const talk = checkTalk(state, PLAYER, ELOWEN, npcId);
  if (!talk.ok) throw new Error(`cannot talk: ${talk.code}`);
  const context = npcDialogueContext(state, {
    speaker: talk.speaker,
    npcId,
    topicId: options.topicId ?? null,
    justShared: options.justShared ?? [],
  });
  if (!context) throw new Error('no context');
  return context;
}

const texts = (lines: readonly DialogueLine[]) => lines.map((line) => line.text);
const names = (entities: readonly DialogueEntity[]) => entities.map((entity) => entity.name);

/** The boundary world with the party holding the symbol evidence, Elowen in Orin's shop. */
async function atOrins(): Promise<InvestigationWorld> {
  const world = await boundaryWorld();
  await world.submit(
    {
      type: 'AddKnowledge',
      knowledgeId: SYMBOL_EVIDENCE,
      scope: { kind: 'PARTY' },
      knowledgeType: 'EVIDENCE',
      statement: 'A strange symbol is burned into a wagon plank.',
      subjects: ['feature-19c7c7f7'],
      knownSince: null,
    },
    DM,
  );
  await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'orins-alchemy' });
  return world;
}

describe('the Orin scene, as Orin may speak it', () => {
  it('before the symbol is shown: what he would tell anyone, and guarded topics without content', async () => {
    const context = await contextFor(await atOrins(), ORIN);

    expect(context.npc).toEqual({ entityId: ORIN, kind: 'npc', name: 'Orin Stonebeard' });
    expect(context.speaker).toEqual({
      entityId: ELOWEN,
      kind: 'character',
      name: 'Elowen Starwhisper',
    });
    expect(context.attitude).toBe('NEUTRAL');
    expect(context.place?.name).toBe("Orin's Alchemy");
    expect(texts(context.justTold)).toEqual([]);
    expect(texts(context.mayTell)).toEqual(['NBXORINWILLING: the shop opens at dawn.']);
    expect(texts(context.common)).toContain("Orin Stonebeard runs Orin's Alchemy.");
    expect(texts(context.memories)).toEqual([
      'Last spring a caravan vanished on the Old Trade Road.',
      'NBXORINMEMORY: Orin swept the shop at dawn.',
    ]);
    expect(names(context.guarded)).toEqual(['Strange Symbol', 'Captain Thorne', 'Old Trade Road']);
    expect(context.shown).toEqual([]);
  });

  it('once shown the symbol and asked: the prior incident told, its memory recallable, never the secret', async () => {
    const world = await atOrins();
    await world.submit({
      type: 'ShowEvidence',
      characterId: ELOWEN,
      npcId: ORIN,
      knowledgeId: SYMBOL_EVIDENCE,
    });
    const asked = await world.submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: ORIN,
      topicId: 'feature-19c7c7f7',
    });
    const snapshot = await world.engine.load(CAMPAIGN);
    const justShared = sharedSources(snapshot?.history ?? [], asked.commandId ?? '');
    expect(justShared).toEqual(['orin-prior-incident']);

    const context = await contextFor(world, ORIN, { topicId: 'feature-19c7c7f7', justShared });
    expect(context.topic?.name).toBe('Strange Symbol');
    expect(names(context.shown)).toEqual(['Strange Symbol']);
    expect(texts(context.justTold)).toEqual([
      'Orin recognized the same symbol after a caravan vanished last spring.',
    ]);
    expect(texts(context.mayTell)).toEqual(['NBXORINWILLING: the shop opens at dawn.']);
    expect(texts(context.memories)).toContain(
      'A frightened traveller showed Orin the strange symbol scratched on a broken crate.',
    );
    // Still guarded: his secret about the symbol, and knowing Thorne.
    expect(names(context.guarded)).toEqual(['Strange Symbol', 'Captain Thorne']);
    const all = JSON.stringify(context);
    expect(all).not.toContain('reagent');
    expect(all).not.toContain('NBXORINSECRET');
    expect(all).not.toContain('NBXMEMSECRET');
  });

  it('tells a trusted party everything but a secret', async () => {
    const world = await atOrins();
    await world.submit({ type: 'SetRelationship', npcId: ORIN, attitude: 'TRUSTED' }, DM);
    const context = await contextFor(world, ORIN);

    expect(context.attitude).toBe('TRUSTED');
    expect(texts(context.mayTell)).toEqual([
      'Orin knows Captain Thorne personally.',
      'Orin recognized the same symbol after a caravan vanished last spring.',
      'NBXORINWILLING: the shop opens at dawn.',
    ]);
    expect(names(context.guarded)).toEqual(['Strange Symbol']);
    expect(JSON.stringify(context)).not.toContain('NBXORINSECRET');
  });

  it('gives a hostile NPC only what it would tell anyone', async () => {
    const world = await atOrins();
    await world.submit({ type: 'SetRelationship', npcId: ORIN, attitude: 'HOSTILE' }, DM);
    await world.submit({
      type: 'ShowEvidence',
      characterId: ELOWEN,
      npcId: ORIN,
      knowledgeId: SYMBOL_EVIDENCE,
    });
    const context = await contextFor(world, ORIN);
    expect(texts(context.mayTell)).toEqual(['NBXORINWILLING: the shop opens at dawn.']);
    expect(texts(context.memories)).not.toContain(
      'A frightened traveller showed Orin the strange symbol scratched on a broken crate.',
    );
  });
});

describe('names the speaker does not know', () => {
  it('keeps them out: a stranger in the shop is someone, by kind only', async () => {
    const context = await contextFor(await atOrins(), ORIN);
    expect(context.around).toContainEqual({
      entityId: 'npc-2c4cf6cd',
      kind: 'npc',
      name: null,
    });
  });

  it('keeps the NPC’s own name out until the speaker knows it', async () => {
    const world = await atOrins();
    await world.submit(
      {
        type: 'CreateEntity',
        entityId: 'quiet-buyer',
        kind: 'npc',
        name: 'Vesk the Quiet',
        existsSince: null,
        placement: { locationId: 'orins-alchemy', since: null },
      },
      DM,
    );
    const context = await contextFor(world, 'quiet-buyer');
    expect(context.npc).toEqual({ entityId: 'quiet-buyer', kind: 'npc', name: null });
    expect(JSON.stringify(context)).not.toContain('Vesk');
  });

  it('never names a topic the speaker does not know', async () => {
    const world = await atOrins();
    const context = await contextFor(world, ORIN, {
      topicId: '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53',
    });
    expect(context.topic).toBeNull();
    expect(JSON.stringify(context)).not.toContain('Ashen');
  });
});

describe('the trace’s sources', () => {
  it('names every source the context drew on, and only those', async () => {
    const context = await contextFor(await atOrins(), ORIN);
    const sources = dialogueSourceIds(context);

    expect(sources).toEqual(
      expect.arrayContaining([
        'world#clock',
        `relationship#${ORIN}`,
        ORIN,
        ELOWEN,
        'orins-alchemy',
        'nb-orin-willing',
        'nb-orin-memory-willing',
        'mem-public-vanished-spring',
      ]),
    );
    for (const hidden of ['nb-orin-secret', 'orin-prior-incident', 'orin-knows-thorne']) {
      expect(sources).not.toContain(hidden);
    }
  });
});
