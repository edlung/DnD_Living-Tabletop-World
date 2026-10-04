import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { visibleRecords } from '../knowledge/projection.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  MODIFIERS,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/**
 * Guarded disclosure (docs/adr/0020-npc-intelligence.md §2, owner decision):
 * the Orin scene. Orin guards what he knows about the strange symbol; shown
 * the symbol by a party he does not distrust, he tells the prior incident,
 * never his secret. Every answer rests on recorded premises, so undo stays
 * exact.
 */
const SYMBOL_EVIDENCE = 'party-symbol-evidence';
const ORIN = 'orin-stonebeard';

/** The party holds evidence of the symbol and Elowen stands in Orin's shop. */
async function atOrins(): Promise<InvestigationWorld> {
  const world = await investigationWorld();
  await world.submit(
    {
      type: 'AddKnowledge',
      knowledgeId: SYMBOL_EVIDENCE,
      scope: { kind: 'PARTY' },
      knowledgeType: 'EVIDENCE',
      statement: 'A strange symbol is burned into a wagon plank.',
      subjects: ['strange-symbol'],
      knownSince: null,
    },
    DM,
  );
  expect(
    codeOf(
      await world.submit({
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId: 'orins-alchemy',
      }),
    ),
  ).toBe('accepted');
  return world;
}

const ask = (world: InvestigationWorld, topicId = 'strange-symbol') =>
  world.submit({ type: 'AskAbout', characterId: ELOWEN, npcId: ORIN, topicId });
const show = (world: InvestigationWorld, knowledgeId = SYMBOL_EVIDENCE) =>
  world.submit({ type: 'ShowEvidence', characterId: ELOWEN, npcId: ORIN, knowledgeId });
const attitude = (world: InvestigationWorld, value: string) =>
  world.submit({ type: 'SetRelationship', npcId: ORIN, attitude: value }, DM);
const sharedOf = (result: CommandResult) =>
  result.status === 'accepted' && result.outcome?.kind === 'AskAbout' ? result.outcome.shared : [];

async function partyStatements(world: InvestigationWorld) {
  const state = await world.state();
  return visibleRecords(state, holderPerspective(state, { kind: 'PARTY' }))
    .filter((record) => record.attributedTo === ORIN)
    .map((record) => record.statement);
}

async function exact(world: InvestigationWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const log = await world.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
}

describe('the Orin scene', () => {
  it('guards the symbol until shown it, then tells the prior incident and never the secret', async () => {
    const world = await atOrins();
    expect(codeOf(await ask(world))).toBe('NO_EFFECT');

    const shown = await show(world);
    expect(codeOf(shown)).toBe('accepted');
    expect(shown.status === 'accepted' ? shown.outcome : null).toEqual({
      kind: 'ShowEvidence',
      shown: SYMBOL_EVIDENCE,
    });

    const told = await ask(world);
    expect(sharedOf(told)).toHaveLength(1);
    expect(await partyStatements(world)).toEqual([
      'Orin recognized the same symbol after a caravan vanished last spring.',
    ]);
    // Asking again: told once, and the secret never.
    expect(codeOf(await ask(world))).toBe('NO_EFFECT');
    await exact(world);
  });

  it('stays guarded with a hostile or wary Orin, even when shown', async () => {
    for (const value of ['HOSTILE', 'WARY']) {
      const world = await atOrins();
      await attitude(world, value);
      await show(world);
      expect(codeOf(await ask(world)), value).toBe('NO_EFFECT');
    }
  });

  it('tells a trusted party without being shown, but never a secret', async () => {
    const world = await atOrins();
    await attitude(world, 'TRUSTED');
    const told = await ask(world, 'old-trade-road');

    expect(sharedOf(told)).toHaveLength(1);
    expect(await partyStatements(world)).toEqual([
      'Orin recognized the same symbol after a caravan vanished last spring.',
    ]);
    expect(codeOf(await ask(world))).toBe('NO_EFFECT');
  });
});

describe('ShowEvidence', () => {
  it('needs evidence the character holds, an NPC here, and alive', async () => {
    const world = await atOrins();
    expect(codeOf(await show(world, 'truth-symbol-meaning'))).toBe('KNOWLEDGE_NOT_FOUND');
    expect(codeOf(await show(world, 'party-mira-departure'))).toBe('KNOWLEDGE_NOT_FOUND');
    expect(codeOf(await show(world, 'no-such-record'))).toBe('KNOWLEDGE_NOT_FOUND');
    expect(
      codeOf(
        await world.submit({
          type: 'ShowEvidence',
          characterId: ELOWEN,
          npcId: 'mira-vale',
          knowledgeId: SYMBOL_EVIDENCE,
        }),
      ),
    ).toBe('NOT_PRESENT');
    await world.submit({ type: 'ChangeEntityStatus', entityId: ORIN, status: 'dead' }, DM);
    expect(codeOf(await show(world))).toBe('TARGET_DEAD');
  });

  it('never shows evidence held by anyone else, answering as for a nonexistent record', async () => {
    const world = await atOrins();
    await world.submit(
      {
        type: 'CreateEntity',
        entityId: 'bram-tull',
        kind: 'character',
        name: 'Bram Tull',
        existsSince: null,
        placement: { locationId: 'orins-alchemy', since: null },
      },
      DM,
    );
    const scopes = {
      'dm-symbol-evidence': { kind: 'DM' },
      'public-symbol-evidence': { kind: 'PUBLIC' },
      'mira-symbol-evidence': { kind: 'NPC', npcId: 'mira-vale' },
      'bram-symbol-evidence': { kind: 'CHARACTER', characterId: 'bram-tull' },
    };
    for (const [knowledgeId, scope] of Object.entries(scopes)) {
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId,
          scope,
          knowledgeType: 'EVIDENCE',
          statement: 'Someone else holds this.',
          subjects: ['strange-symbol'],
          knownSince: null,
        },
        DM,
      );
      expect(codeOf(await show(world, knowledgeId)), knowledgeId).toBe('KNOWLEDGE_NOT_FOUND');
    }
    expect(codeOf(await ask(world))).toBe('NO_EFFECT');
  });

  it('shows a subject once; showing it again records only a memory', async () => {
    const world = await atOrins();
    await show(world);
    const again = await show(world);
    const snapshot = await world.engine.load(CAMPAIGN);
    const second = snapshot?.history.filter(
      (event) => event.causation.commandId === again.commandId,
    );

    expect(second?.find((event) => event.type === 'EvidenceShown')?.payload).toMatchObject({
      subjects: [],
    });
    await exact(world);
  });
});

describe('undo stays exact', () => {
  it('refuses to undo the showing, or an attitude, that a told secret rested on', async () => {
    const world = await atOrins();
    const softened = await attitude(world, 'FRIENDLY');
    const shown = await show(world);
    expect(sharedOf(await ask(world))).toHaveLength(1);
    const undo = (target: CommandResult) =>
      world.submit({ type: 'UndoCommand', targetCommandId: target.commandId ?? '' }, DM);

    expect(codeOf(await undo(shown))).toBe('UNDO_UNSAFE');
    expect(codeOf(await undo(softened))).toBe('UNDO_UNSAFE');
    await exact(world);
  });

  it('refuses to undo a disclosure change beneath an answer that considered it', async () => {
    // Mira is in Market Square with Elowen. Her departure account was willing, then guarded.
    const world = await investigationWorld();
    const disclose = (disclosure: string) =>
      world.submit({ type: 'SetDisclosure', knowledgeId: 'mira-departure', disclosure }, DM);
    await disclose('WILLING');
    const guarded = await disclose('GUARDED');
    const asked = await world.submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: 'mira-vale',
      topicId: 'guild-caravan',
    });
    // Shares the willing cargo account; considers, and keeps, the guarded departure.
    expect(sharedOf(asked)).toHaveLength(1);

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: guarded.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    await exact(world);
  });

  it('refuses to undo an earlier telling that a later answer passed over', async () => {
    // Thorne's departure account is attributed to him: asked about himself, he tells it.
    const world = await investigationWorld();
    await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' });
    const askThorne = (topicId: string) =>
      world.submit({ type: 'AskAbout', characterId: ELOWEN, npcId: 'captain-thorne', topicId });
    const first = await askThorne('captain-thorne');
    expect(sharedOf(first)).toHaveLength(1);
    // About the caravan he tells only the route: the departure was told already.
    expect(sharedOf(await askThorne('guild-caravan'))).toHaveLength(1);

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: first.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    await exact(world);
  });

  it('refuses to undo a telling that an Insight found nothing beyond', async () => {
    const world = await atOrins();
    await show(world);
    const told = await ask(world);
    world.roll(15);
    const read = await world.submit({
      type: 'InsightCheck',
      characterId: ELOWEN,
      npcId: ORIN,
      topicId: 'old-trade-road',
    });
    expect(read.status === 'accepted' ? read.outcome : null).toMatchObject({ inferred: [] });

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: told.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    await exact(world);
  });

  it('refuses to undo a rename that a conversation memory quotes', async () => {
    const world = await atOrins();
    const renamed = await world.submit(
      { type: 'UpdateEntityProfile', entityId: ORIN, name: 'Orin the Grey' },
      DM,
    );
    await show(world);
    await ask(world);
    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: renamed.commandId ?? '' },
      DM,
    );

    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    await exact(world);
  });
});
