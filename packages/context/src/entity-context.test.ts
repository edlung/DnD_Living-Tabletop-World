import type { ContextAction, EntityContextView } from '@ltw/contracts';
import type { ResolvedPerspective, WorldState } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { entityContext } from './entity-context.ts';
import { DM, ELOWEN, PLAYER, elowenView, perspective, seedRavenford } from './testing/ravenford.ts';

/** Critical Context Contract on the seeded Ravenford world (docs/adr/0012-context-engine.md). */
let state: WorldState;
let elowen: ResolvedPerspective;

beforeAll(async () => {
  ({ state } = await seedRavenford());
  elowen = elowenView(state);
});

function contextOf(entityId: string, view = elowen, world = state): EntityContextView {
  const result = entityContext(world, view, entityId);
  if (!result.ok) throw new Error(`no context: ${result.reason}`);
  return result.context;
}

const summary = (actions: readonly ContextAction[]) =>
  actions.map((action) =>
    [action.id, action.topic?.entityId, action.legal ? 'legal' : action.reason, action.relevance]
      .filter((part) => part !== undefined)
      .join(' '),
  );

describe('selecting Mira Vale in Market Square (RAVENFORD_SPEC)', () => {
  it('shows identity and whitelisted visible state only', () => {
    const context = contextOf('mira-vale');
    expect(context.entity).toEqual({ entityId: 'mira-vale', kind: 'npc', name: 'Mira Vale' });
    expect(context.visibleState).toEqual({ present: true, status: 'active' });
  });

  it('offers Talk, Trade, Ask about Ravenford and Inspect, ranked deterministically', () => {
    expect(summary(contextOf('mira-vale').actions)).toEqual([
      'ask_about merchant-guild-faction legal high',
      'ask_about guild-caravan legal high',
      'recall legal high',
      'talk legal medium',
      'ask_about market-square legal medium',
      'trade legal low',
      'ask_about ravenford legal low',
      'ask_about captain-thorne legal low',
      'inspect legal low',
      'insight_check legal low',
      'healing_word legal low',
      'hunters_mark legal low',
      'longbow_attack legal low',
    ]);
  });

  it('describes how spells would be paid and that range is not tracked outside combat', () => {
    const actions = contextOf('mira-vale').actions;
    expect(actions.find((action) => action.id === 'healing_word')).toEqual({
      id: 'healing_word',
      legal: true,
      relevance: 'low',
      cost: { kind: 'free' },
      hints: ['RANGE_NOT_TRACKED'],
    });
    expect(actions.find((action) => action.id === 'longbow_attack')?.hints).toEqual([
      'RANGE_NOT_TRACKED',
    ]);
  });

  it('keeps legal but suboptimal choices legal (invariant 20)', () => {
    const attack = contextOf('mira-vale').actions.find((action) => action.id === 'longbow_attack');
    expect(attack).toMatchObject({ legal: true, relevance: 'low' });
  });
});

describe('the acting character and the party', () => {
  it('shows her own hit points and offers no social actions on herself', () => {
    const context = contextOf(ELOWEN);
    expect(context.visibleState).toEqual({
      present: true,
      status: 'active',
      hitPoints: { current: 78, max: 78 },
    });
    expect(summary(context.actions)).toEqual([
      'recall legal high',
      'inspect legal low',
      'healing_word legal low',
    ]);
  });

  it('never shows hit points of anyone outside the party', async () => {
    const seeded = await seedRavenford();
    const world = await seeded.apply({
      type: 'SetCharacterSheet',
      entityId: 'mira-vale',
      sheet: seeded.state.characterSheets.get(ELOWEN),
    });
    expect(contextOf('mira-vale', elowenView(world), world).visibleState).toEqual({
      present: true,
      status: 'active',
    });
  });

  it('ranks Healing Word high on a wounded present party member', async () => {
    const seeded = await seedRavenford();
    const sheet = seeded.state.characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('missing sheet');
    const world = await seeded.apply({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, hitPoints: { max: 78, current: 40 } },
    });
    const healing = contextOf(ELOWEN, elowenView(world), world).actions[0];
    expect(healing).toMatchObject({ id: 'healing_word', legal: true, relevance: 'high' });
  });
});

describe('locations (ADR 0013 §5)', () => {
  it('offers travel to a known place and reports where the character already is', () => {
    const road = contextOf('old-trade-road').actions.find((a) => a.id === 'enter_location');
    expect(road).toEqual({ id: 'enter_location', legal: true, relevance: 'low' });
    const here = contextOf('market-square').actions.find((a) => a.id === 'enter_location');
    expect(here).toMatchObject({ legal: false, reason: 'ALREADY_HERE' });
  });
});

describe('who may request a context', () => {
  it('returns the same context to the player and to the DM previewing her character', () => {
    const preview = perspective(state, DM, { kind: 'CHARACTER', characterId: ELOWEN });
    expect(entityContext(state, preview, 'mira-vale')).toEqual(
      entityContext(state, elowen, 'mira-vale'),
    );
    const own = perspective(state, PLAYER, { kind: 'CHARACTER', characterId: ELOWEN });
    expect(entityContext(state, own, 'mira-vale')).toEqual(
      entityContext(state, elowen, 'mira-vale'),
    );
  });

  it.each([
    [{ kind: 'DM' }, DM],
    [{ kind: 'PARTY' }, PLAYER],
    [{ kind: 'PUBLIC' }, PLAYER],
    [{ kind: 'NPC', npcId: 'mira-vale' }, DM],
  ] as const)('refuses %o: no acting character', (request, actor) => {
    expect(entityContext(state, perspective(state, actor, request), 'mira-vale')).toEqual({
      ok: false,
      reason: 'NO_ACTING_CHARACTER',
    });
  });
});

describe('selectable entities', () => {
  it('treats unknown, unperceived and nonexistent entities identically', () => {
    for (const entityId of ['strange-symbol', 'abandoned-caravan-site', 'no-such-entity']) {
      expect(entityContext(state, elowen, entityId)).toEqual({ ok: false, reason: 'NOT_FOUND' });
    }
  });

  it('shows a known but absent entity without status or whereabouts', () => {
    const orin = contextOf('orin-stonebeard');
    expect(orin.visibleState).toEqual({ present: false });
    const reasons = new Set(orin.actions.map((action) => action.reason));
    expect(reasons).toEqual(new Set(['NOT_PRESENT']));
  });

  it('shows a perceived stranger by kind only, and asks never use the stranger as a topic', async () => {
    const seeded = await seedRavenford();
    const world = await seeded.apply({
      type: 'CreateEntity',
      entityId: 'hooded-stranger',
      kind: 'npc',
      name: 'Hooded Stranger',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    const view = elowenView(world);
    const stranger = contextOf('hooded-stranger', view, world);
    expect(stranger.entity).toEqual({ entityId: 'hooded-stranger', kind: 'npc', name: null });
    expect(stranger.actions.find((action) => action.id === 'talk')).toMatchObject({ legal: true });
    const topics = contextOf('mira-vale', view, world).actions.flatMap((a) => a.topic ?? []);
    expect(topics.map((topic) => topic.entityId)).not.toContain('hooded-stranger');
  });

  it('offers a topic only after the perspective learns about it', async () => {
    const seeded = await seedRavenford();
    const hidden = await seeded.apply({
      type: 'CreateEntity',
      entityId: 'missing-ledger',
      kind: 'item',
      name: 'Missing Ledger',
      existsSince: null,
    });
    const askLedger = (world: WorldState) =>
      contextOf('mira-vale', elowenView(world), world).actions.find(
        (action) => action.topic?.entityId === 'missing-ledger',
      );
    expect(askLedger(hidden)).toBeUndefined();
    const learned = await seeded.apply({
      type: 'AddKnowledge',
      knowledgeId: 'party-ledger-question',
      scope: { kind: 'PARTY' },
      knowledgeType: 'UNKNOWN',
      statement: 'Where is the guild ledger?',
      subjects: ['missing-ledger'],
      knownSince: null,
    });
    expect(askLedger(learned)).toEqual({
      id: 'ask_about',
      topic: { entityId: 'missing-ledger', kind: 'item', name: 'Missing Ledger' },
      legal: true,
      relevance: 'high',
    });
  });
});
