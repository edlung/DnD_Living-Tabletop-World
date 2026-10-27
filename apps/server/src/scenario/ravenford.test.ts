import { createCombatEngine } from '@ltw/combat';
import type { KnowledgeListResponse, QuestListResponse } from '@ltw/contracts';
import {
  checkWorldIntegrity,
  parseRecordedEvent,
  redecideEffective,
  replay,
  type RecordedEvent,
} from '@ltw/domain';
import { skillModifier } from '@ltw/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { playDayOne, partyKnowledge, type DayOne } from '../testing/scenario/play-day-one.ts';
import { CHAPTER_TITLE, playRoad, type Road } from '../testing/scenario/play-road.ts';
import { NEVER_FOR_PLAYERS } from '../testing/scenario/secrets.ts';
import { BASE, CAMPAIGN, RavenfordSession } from '../testing/scenario/session.ts';

/**
 * The Stage 180 vertical slice (EXECUTION_PLAN.md: arrival → investigation →
 * DM authoring → combat/Counterspell → return → time advance → Chronicle),
 * played once over the real HTTP application by the DM and the player
 * (docs/adr/0025-ravenford-integration.md §3). Each block checks one stretch
 * of RAVENFORD_SPEC.md against what the routes returned and what the World
 * Engine recorded.
 */
let session: RavenfordSession;
let one: DayOne;
let road: Road;

beforeAll(async () => {
  session = await RavenfordSession.open();
  one = await playDayOne(session);
  road = await playRoad(session);
}, 60_000);

afterAll(async () => {
  await session.close();
});

const eventsOf = async <T extends RecordedEvent['type']>(type: T) =>
  (await session.snapshot()).history.filter(
    (event): event is Extract<RecordedEvent, { type: T }> => event.type === type,
  );

describe('arrival: the Market Square and Mira', () => {
  it('offers Mira’s contextual actions, with the missing caravan already a topic', () => {
    const actions = one.miraContext.context.actions;
    expect(actions.find((a) => a.id === 'talk')).toMatchObject({ legal: true });
    expect(actions.find((a) => a.id === 'trade')).toMatchObject({
      legal: false,
      reason: 'NOT_AVAILABLE',
    });
    expect(
      actions.find((a) => a.id === 'ask_about' && a.topic?.entityId === 'guild-caravan'),
    ).toMatchObject({
      legal: true,
    });
  });

  it('lets Elowen talk without changing the world, and ask about the caravan', () => {
    expect(one.talk).toMatchObject({
      command: null,
      reply: { status: 'REPLIED', canonical: false },
    });
    expect(one.askMira.command).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'AskAbout' },
    });
  });
});

describe('the caravan site', () => {
  it('resolves every examination by the Rules and keeps the goblin theory a hypothesis', async () => {
    const examined = await eventsOf('EvidenceExamined');
    expect(examined).toHaveLength(one.examined);
    expect(examined.filter((e) => e.payload.roll !== null).map((e) => e.payload.roll?.d20)).toEqual(
      [15, 15, 15, 15, 15],
    );
    const knowledge = await partyKnowledge(session);
    expect(knowledge.map((r) => r.statement)).toEqual(
      expect.arrayContaining([
        'The spokes were sawn through cleanly, not smashed.',
        'Heavy boot prints, too large for goblins, lead north off the road.',
      ]),
    );
    const goblins = knowledge.find((r) => r.statement === 'Goblins attacked the caravan.');
    expect(goblins?.knowledgeType).toBe('HYPOTHESIS');
    expect(
      knowledge.find((r) => r.statement === 'Someone wanted the attack to look like goblins.')
        ?.knowledgeType,
    ).toBe('HYPOTHESIS');
    expect(one.symbolContext.context.actions.map((a) => a.id)).toEqual(
      expect.arrayContaining(['inspect', 'investigation_check', 'detect_magic']),
    );
  });
});

describe('Orin and the contradiction', () => {
  it('shows Orin the symbol, hears his account, reads him, and never learns his secret', async () => {
    expect(one.showOrin.command).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'ShowEvidence' },
    });
    expect(one.askOrin.command).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'AskAbout' },
    });
    expect(one.insightOrin.command).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'InsightCheck' },
    });
    const fromOrin = (await partyKnowledge(session)).filter(
      (r) => r.attributedTo?.entityId === 'orin-stonebeard',
    );
    expect(fromOrin.map((r) => r.statement)).toEqual([
      'Orin recognized the same symbol after a caravan vanished last spring.',
    ]);
    expect(fromOrin[0]?.knowledgeType).toBe('TESTIMONY');
  });

  it('surfaces Mira against Thorne without deciding who is lying', async () => {
    const knowledge = await partyKnowledge(session);
    const accounts = knowledge.filter(
      (r) =>
        r.knowledgeType === 'TESTIMONY' && r.subjects.some((s) => s.entityId === 'guild-caravan'),
    );
    expect(accounts.map((r) => r.attributedTo?.entityId)).toEqual(
      expect.arrayContaining(['mira-vale', 'captain-thorne']),
    );
    const contradiction = knowledge.find((r) => r.knowledgeType === 'CONTRADICTION');
    expect(contradiction?.statement).toMatch(/disagree/);
    expect(contradiction?.statement).not.toMatch(/lie|liar|lying|true|false/i);
    expect(await eventsOf('ContradictionDetected')).toHaveLength(1);
  });
});

describe('the DM authors Tomas Reed', () => {
  it('commits the confirmed proposal as one auditable command with its asset request', async () => {
    expect(one.commit.json<{ status: string; commandId: string }>()).toMatchObject({
      status: 'accepted',
      commandId: `authoring.${one.proposal.proposal.proposalId}`,
    });
    const commit = (await session.snapshot()).history.filter(
      (e) => e.causation.commandType === 'ApplyAuthoring',
    );
    expect(commit.map((e) => e.type)).toEqual([
      'EntityCreated',
      'EntityPlaced',
      'KnowledgeAssigned',
      'DisclosureSet',
      'AssetRequested',
    ]);
    const lineage = (await session.get('dm', `${BASE}/assets`)).json<{
      canonical: { entityId: string }[];
    }>();
    expect(lineage.canonical.map((c) => c.entityId)).toContain(one.tomasId);
  });

  it('puts Tomas in the world as a native NPC the player meets and hears', () => {
    expect(one.tomasContext.context.actions.find((a) => a.id === 'talk')).toMatchObject({
      legal: true,
    });
    expect(one.askTomas.command).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'AskAbout' },
    });
    const seen = session.exchanges.filter((e) => e.persona === 'player' && e.phase === 'authoring');
    for (const exchange of seen)
      expect(exchange.body).not.toMatch(/authoring|proposal|AI-generated/i);
    // The server named him, not the model (ADR 0008, Gate 06 remediation): no player body
    // carries the model's ID.
    expect(one.tomasId).not.toMatch(/tomas/i);
    for (const exchange of session.exchanges.filter((e) => e.persona === 'player'))
      expect(exchange.body).not.toContain('tomas-reed');
  });

  it('lets the DM perform Tomas from his own scoped context, traced for the DM alone', async () => {
    expect(one.performed).toMatchObject({
      command: null,
      reply: { status: 'REPLIED', canonical: false },
    });
    const trace = await session.get(
      'dm',
      `${BASE}/ai/traces/${one.performed.reply?.traceId ?? ''}`,
    );
    expect(trace.json<{ scope: string }>().scope).toBe(`NPC:${one.tomasId}`);
    expect(
      (await session.get('player', `${BASE}/ai/traces/${one.performed.reply?.traceId ?? ''}`))
        .status,
    ).toBe(403);
  });
});

describe('the Old Trade Road ambush', () => {
  it('offers legal, ranked actions on an enemy, with Fireball’s area shown', () => {
    const actions = road.raiderContext.context.actions;
    expect(actions.find((a) => a.id === 'longbow_attack')).toMatchObject({ legal: true });
    const fireball = actions.find((a) => a.id === 'fireball');
    expect(fireball).toMatchObject({ legal: true });
    expect(fireball?.area?.affected.length).toBeGreaterThan(0);
    expect(fireball?.hints ?? []).not.toContain('ALLY_IN_AREA');
  });

  it('resolves attack, cover, damage, a condition, the Counterspell, and Fireball by the Rules', async () => {
    expect(road.attack).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'Attack', hit: true },
    });
    expect(
      (await eventsOf('ConditionApplied')).map((e) => [e.payload.targetId, e.payload.condition]),
    ).toContainEqual(['creature-ae08be99', 'slowed']);
    expect(road.windowView.encounter?.reactionWindow?.choices).toEqual(['counterspell', 'ignore']);
    expect(road.counterspell).toMatchObject({
      status: 'accepted',
      outcome: { reaction: 'counterspell', countered: true },
    });
    expect(road.lateCounterspell).toMatchObject({
      status: 'rejected',
      code: 'REACTION_WINDOW_CLOSED',
    });
    expect(road.fireball).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'CastSpell', spellId: 'fireball' },
    });
    const dead = (await eventsOf('EntityStatusChanged'))
      .filter((e) => e.payload.to === 'dead')
      .map((e) => e.payload.entityId);
    expect(dead.sort()).toEqual([
      'creature-10fb59d4',
      'creature-589f6668',
      'creature-6513bec0',
      'creature-ae08be99',
    ]);
    expect(await eventsOf('CombatEnded')).toHaveLength(1);
  });
});

describe('the return and Day 2', () => {
  it('shows Mira the evidence the party brought back, and she has warmed to them', async () => {
    const show = road.miraAfter.context.actions.filter((a) => a.id === 'show_evidence');
    expect(show.length).toBeGreaterThan(0);
    expect(road.talkAfter.reply).toMatchObject({ status: 'REPLIED', canonical: false });
    expect((await session.snapshot()).state.relationships.get('mira-vale')).toBe('FRIENDLY');
  });

  it('turns clear skies into rain from Day 1 to Day 2', () => {
    expect(road.squareDayOne).toMatchObject({
      phase: 'day',
      location: { weather: 'clear', observed: true },
    });
    expect(road.squareDayTwo).toMatchObject({
      phase: 'day',
      location: { weather: 'rain', observed: true },
    });
  });
});

describe('the Chronicle and the quest log', () => {
  it('tells Chapter I from the party’s memories, every entry traced to recorded events', async () => {
    expect(road.chapter).toMatchObject({
      result: { status: 'accepted' },
      rendering: { status: 'RENDERED' },
    });
    const [chapter] = road.chronicle.chapters;
    expect(chapter?.title).toBe(CHAPTER_TITLE);
    const texts = chapter?.entries.map((e) => e.text) ?? [];
    expect(texts).toEqual(
      expect.arrayContaining([
        'Mira told us the caravan left before dawn.',
        'We fought 4 foes at Old Trade Road. 4 of them fell. A spell was countered.',
        'We returned to Ravenford.',
        'Day 2 dawned.',
      ]),
    );
    const recorded = new Set((await session.snapshot()).history.map((e) => e.eventId));
    for (const entry of chapter?.entries ?? []) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const source of entry.sources) expect(recorded.has(source.eventId)).toBe(true);
    }
  });

  it('opens Mira’s account and the fight as flashbacks', () => {
    expect(road.miraFlashback).toMatchObject({
      dialogue: { knowledgeType: 'TESTIMONY', speaker: { entityId: 'mira-vale' } },
      scene: { entityId: 'market-square' },
    });
    expect(road.battleFlashback.participants.map((p) => p.entity.entityId)).toContain(
      'creature-ae08be99',
    );
    expect(road.battleFlashback.scene?.entityId).toBe('old-trade-road');
  });

  it('tracks the Missing Caravan from Mira’s account to the return', async () => {
    const [quest] = road.quests.quests;
    expect(quest?.transitions.map((t) => [t.type, t.stage])).toEqual([
      ['QuestActivated', 'activated'],
      ['QuestUpdated', 'hypothesis-formed'],
      ['QuestUpdated', 'site-reached'],
      ['QuestUpdated', 'evidence-examined'],
      ['QuestUpdated', 'symbol-recognized'],
      ['QuestUpdated', 'contradiction-found'],
      ['QuestUpdated', 'ambush-survived'],
      ['QuestUpdated', 'returned'],
    ]);
    const recorded = new Set((await session.snapshot()).history.map((e) => e.eventId));
    for (const transition of quest?.transitions ?? []) {
      for (const source of transition.sources) expect(recorded.has(source.eventId)).toBe(true);
    }
    const own = (
      await session.get('player', `${BASE}/quests?perspective=PLAYER`)
    ).json<QuestListResponse>();
    expect(own.quests).toEqual(road.quests.quests);
    expect(
      (await session.get('dm', `${BASE}/quests?perspective=PUBLIC`)).json<QuestListResponse>()
        .quests,
    ).toEqual([]);
  });
});

describe('the whole session', () => {
  it('never sent the player the mystery’s truth, the DM’s notes, or anyone’s secrets', async () => {
    // Also the knowledge views, which a player may read at any time.
    for (const perspective of ['PLAYER', 'PARTY', 'PUBLIC']) {
      (
        await session.get('player', `${BASE}/knowledge?perspective=${perspective}`)
      ).json<KnowledgeListResponse>();
    }
    const seen = session.seenBy('player');
    expect(seen.length).toBeGreaterThan(40);
    for (const body of seen) {
      for (const marker of NEVER_FOR_PLAYERS) expect(body, marker).not.toContain(marker);
    }
  });

  it('leaves a consistent world: integrity, the re-decision oracle, and replay from stored JSON', async () => {
    const snapshot = await session.snapshot();
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    const log = await session.engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, snapshot, skillModifier, createCombatEngine())).toBeNull();
    const stored = (JSON.parse(JSON.stringify(snapshot.history)) as unknown[]).map(
      parseRecordedEvent,
    );
    expect(replay(stored)).toEqual(snapshot.state);
  });
});
