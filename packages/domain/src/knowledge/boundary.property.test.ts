import type { PerspectiveRequest } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import type { WorldState } from '../kernel/state.ts';
import {
  DM,
  createHarness,
  expectAccepted,
  seedBasicWorld,
} from '../kernel/testing/kernel-harness.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { resolvePerspective } from './perspective.ts';
import {
  entityKnowledge,
  getKnowledge,
  knownEntities,
  listKnowledge,
  relatedKnowledge,
} from './queries.ts';

/**
 * Randomized knowledge boundary: every record and entity carries a unique
 * canary; an oracle written independently of the production code says what
 * each perspective may see. Every query output must contain exactly the
 * permitted records and no canary of anything else.
 */
interface Scenario {
  readonly state: WorldState;
  readonly scopes: Map<string, { kind: string; holder?: string }>;
  readonly characters: string[];
  readonly npcs: string[];
  readonly players: Map<string, string>;
}

async function randomScenario(seed: number): Promise<Scenario> {
  const rng = mulberry32(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
  const harness = createHarness({ namespace: seed % 1000 });
  await seedBasicWorld(harness);

  const characters = ['c0', 'c1', 'c2'];
  const npcs = ['n0', 'n1', 'n2'];
  const things = ['t0', 't1', 't2', 't3'];
  const create = async (entityId: string, kind: string) =>
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId,
        kind,
        name: `NAME_${entityId}_X`,
        description: `DESC_${entityId}_X`,
        existsSince: null,
      }),
    );
  for (const id of characters) await create(id, 'character');
  for (const id of npcs) await create(id, 'npc');
  for (const id of things) await create(id, pick(['item', 'faction', 'feature']));

  const players = new Map<string, string>();
  for (const [index, characterId] of characters.entries()) {
    if (rng() < 0.6) {
      players.set(`player-${String(index)}`, characterId);
      expectAccepted(
        await harness.submit({
          type: 'AssignCharacter',
          characterId,
          playerActorId: `player-${String(index)}`,
        }),
      );
    }
  }

  const scopes = new Map<string, { kind: string; holder?: string }>();
  const mentionable = [...characters, ...npcs, ...things];
  for (let i = 0; i < 40; i += 1) {
    const scope = pick([
      { kind: 'WORLD_TRUTH' },
      { kind: 'DM' },
      { kind: 'PUBLIC' },
      { kind: 'PARTY' },
      { kind: 'CHARACTER', characterId: pick(characters) },
      { kind: 'NPC', npcId: pick(npcs) },
    ]);
    const knowledgeId = `r${String(i)}`;
    const existing = [...scopes.keys()];
    const subjects = [
      ...new Set(Array.from({ length: 1 + Math.floor(rng() * 2) }, () => pick(mentionable))),
    ];
    expectAccepted(
      await harness.submit({
        type: 'AddKnowledge',
        knowledgeId,
        scope,
        knowledgeType:
          scope.kind === 'WORLD_TRUTH' ? 'FACT' : pick(['FACT', 'HYPOTHESIS', 'SECRET', 'RUMOR']),
        statement: `CANARY_${knowledgeId}_X`,
        subjects,
        relations:
          existing.length > 0 && rng() < 0.7
            ? [...new Set([pick(existing), pick(existing)])].map((target) => ({
                type: pick(['SUPPORTS', 'CONTRADICTS', 'DERIVED_FROM', 'REFERS_TO'] as const),
                knowledgeId: target,
              }))
            : [],
        knownSince: null,
      }),
    );
    const holder =
      'characterId' in scope ? scope.characterId : 'npcId' in scope ? scope.npcId : undefined;
    scopes.set(
      knowledgeId,
      holder === undefined ? { kind: scope.kind } : { kind: scope.kind, holder },
    );
  }
  return { state: await harness.state(), scopes, characters, npcs, players };
}

/** Independent oracle of ADR 0008's visibility table. */
function oracleVisible(scenario: Scenario, view: { kind: string; holder?: string }): Set<string> {
  const inParty =
    view.kind === 'PARTY' ||
    (view.kind === 'CHARACTER' && [...scenario.players.values()].includes(view.holder ?? ''));
  return new Set(
    [...scenario.scopes].flatMap(([id, scope]) => {
      const visible =
        scope.kind === 'PUBLIC' ||
        (scope.kind === 'PARTY' && inParty) ||
        (scope.kind === view.kind && scope.holder !== undefined && scope.holder === view.holder);
      return visible ? [id] : [];
    }),
  );
}

describe('randomized knowledge boundary', () => {
  it.each([3, 11, 29, 47, 101, 2027])('seed %i', async (seed) => {
    const scenario = await randomScenario(seed);
    const { state } = scenario;
    const views: [PerspectiveRequest, { kind: string; holder?: string }][] = [
      [{ kind: 'PUBLIC' }, { kind: 'PUBLIC' }],
      [{ kind: 'PARTY' }, { kind: 'PARTY' }],
      ...scenario.characters.map((c): [PerspectiveRequest, { kind: string; holder?: string }] => [
        { kind: 'CHARACTER', characterId: c },
        { kind: 'CHARACTER', holder: c },
      ]),
      ...scenario.npcs.map((n): [PerspectiveRequest, { kind: string; holder?: string }] => [
        { kind: 'NPC', npcId: n },
        { kind: 'NPC', holder: n },
      ]),
    ];

    for (const [request, oracleView] of views) {
      const access = resolvePerspective(state, DM, request);
      if (!access.ok) throw new Error('DM must resolve every perspective');
      const p = access.perspective;
      const expected = oracleVisible(scenario, oracleView);

      const list = listKnowledge(state, p);
      expect(list.ok && new Set(list.knowledge.map((view) => view.knowledgeId))).toEqual(expected);

      const allRecordIds = [...scenario.scopes.keys()];
      const entityIds = [...state.entities.keys()];
      const output = JSON.stringify([
        list,
        allRecordIds.map((id) => getKnowledge(state, p, id)),
        allRecordIds.map((id) => relatedKnowledge(state, p, id, 3)),
        entityIds.map((id) => entityKnowledge(state, p, id)),
        knownEntities(state, p),
      ]);

      for (const id of allRecordIds) {
        expect(output.includes(`CANARY_${id}_X`), `${p.label} vs ${id}`).toBe(expected.has(id));
      }
      expect(output).not.toMatch(/DESC_/);

      const knownByOracle = new Set<string>();
      for (const id of expected) {
        state.knowledge.get(id)?.subjects.forEach((subject) => knownByOracle.add(subject));
      }
      if (oracleView.holder !== undefined) knownByOracle.add(oracleView.holder);
      if (p.scopes !== 'ALL' && p.scopes.has('PARTY')) {
        scenario.players.forEach((characterId) => knownByOracle.add(characterId));
      }
      const canaryNamed = entityIds.filter((entityId) => /^[cnt]\d$/.test(entityId));
      for (const entityId of canaryNamed) {
        expect(output.includes(`NAME_${entityId}_X`), `${p.label} vs entity ${entityId}`).toBe(
          knownByOracle.has(entityId),
        );
      }
    }
  });
});
