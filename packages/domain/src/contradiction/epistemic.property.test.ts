import type { KnowledgeType, PerspectiveRequest } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import {
  CAMPAIGN,
  DM,
  createHarness,
  expectAccepted,
  seedBasicWorld,
} from '../kernel/testing/kernel-harness.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import {
  entityKnowledge,
  getKnowledge,
  listKnowledge,
  relatedKnowledge,
} from '../knowledge/queries.ts';

/**
 * Randomized epistemic integrity (ADR 0014, Gate 02 row 70). Records in all
 * scopes carry canaries; DM claims use canary slugs (`zz-…`). An oracle
 * written independently of the production code says which pairs must be
 * recorded where. Checked: exact contradiction pairs and scopes, no type
 * ever changes, every perspective sees exactly the permitted records and
 * contradictions, claim slugs never reach a non-DM view, replay and
 * integrity hold, also after undoing random claims.
 */
type Viewer = string; // 'PUBLIC' | 'PARTY' | 'CHARACTER:c0' | 'NPC:n0' …
interface Placed {
  /** A viewer scope label, or 'WORLD_TRUTH' / 'DM'. */
  readonly scope: string;
  readonly type: KnowledgeType;
  readonly subjects: readonly string[];
  readonly attributedTo: string | null;
}
interface ClaimDraft {
  readonly knowledgeId: string;
  readonly subjectId: string;
  readonly aspect: string;
  readonly value: string;
}

const CHARACTERS = ['c0', 'c1', 'c2'];
const NPCS = ['n0', 'n1', 'n2'];
const SUBJECTS = ['s0', 's1'];

const scopeObject = (scope: Placed['scope']) => {
  if (scope.startsWith('CHARACTER:')) return { kind: 'CHARACTER', characterId: scope.slice(10) };
  if (scope.startsWith('NPC:')) return { kind: 'NPC', npcId: scope.slice(4) };
  return { kind: scope };
};

/** Oracle audience: which viewers see records of a scope (ADR 0008 table). */
function audience(scope: Placed['scope'], party: ReadonlySet<string>): Set<Viewer> {
  const all = [
    'PUBLIC',
    'PARTY',
    ...CHARACTERS.map((c) => `CHARACTER:${c}`),
    ...NPCS.map((n) => `NPC:${n}`),
  ];
  if (scope === 'PUBLIC') return new Set(all);
  if (scope === 'PARTY') return new Set(['PARTY', ...[...party].map((c) => `CHARACTER:${c}`)]);
  if (scope === 'WORLD_TRUTH' || scope === 'DM') return new Set();
  return new Set([scope]);
}

/** Oracle joint scope: one of the two scopes whose audience both audiences contain. */
function oracleJoint(
  a: Placed['scope'],
  b: Placed['scope'],
  party: ReadonlySet<string>,
): Viewer | null {
  if (['WORLD_TRUTH', 'DM'].includes(a) || ['WORLD_TRUTH', 'DM'].includes(b)) return null;
  const [aa, ab] = [audience(a, party), audience(b, party)];
  for (const candidate of [a, b]) {
    const members = audience(candidate, party);
    if (members.size > 0 && [...members].every((viewer) => aa.has(viewer) && ab.has(viewer))) {
      return candidate;
    }
  }
  return null;
}

async function scenario(seed: number) {
  const rng = mulberry32(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
  const harness = createHarness({ namespace: (seed % 900) + 50 });
  await seedBasicWorld(harness);
  const create = async (entityId: string, kind: string) =>
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId,
        kind,
        name: `NAME_${entityId}_X`,
        existsSince: null,
      }),
    );
  for (const id of CHARACTERS) await create(id, 'character');
  for (const id of NPCS) await create(id, 'npc');
  for (const id of SUBJECTS) await create(id, 'item');
  const party = new Set<string>();
  for (const [index, characterId] of CHARACTERS.entries()) {
    if (rng() < 0.6) {
      party.add(characterId);
      expectAccepted(
        await harness.submit({
          type: 'AssignCharacter',
          characterId,
          playerActorId: `player-${String(index)}`,
        }),
      );
    }
  }

  const placed = new Map<string, Placed>();
  for (let i = 0; i < 30; i += 1) {
    const scope = pick<Placed['scope']>([
      'WORLD_TRUTH',
      'DM',
      'PUBLIC',
      'PUBLIC',
      'PARTY',
      'PARTY',
      ...CHARACTERS.map((c) => `CHARACTER:${c}`),
      ...NPCS.map((n) => `NPC:${n}`),
    ]);
    const type: KnowledgeType =
      scope === 'WORLD_TRUTH'
        ? pick(['FACT', 'SECRET'] as const)
        : pick([
            'FACT',
            'EVIDENCE',
            'TESTIMONY',
            'RUMOR',
            'HYPOTHESIS',
            'SECRET',
            'UNKNOWN',
          ] as const);
    const subjects = [...new Set([pick(SUBJECTS), pick(SUBJECTS)])];
    const attributedTo = type === 'TESTIMONY' ? pick(NPCS) : null;
    const knowledgeId = `r${String(i)}`;
    expectAccepted(
      await harness.submit({
        type: 'AddKnowledge',
        knowledgeId,
        scope: scopeObject(scope),
        knowledgeType: type,
        statement: `CANARY_${knowledgeId}_X`,
        subjects,
        ...(attributedTo ? { attributedTo } : {}),
        knownSince: null,
      }),
    );
    placed.set(knowledgeId, { scope, type, subjects, attributedTo });
  }

  const claims = new Map<string, ClaimDraft>();
  const claimCommands = new Map<string, string>();
  for (let i = 0; i < 40; i += 1) {
    const knowledgeId = `r${String(Math.floor(rng() * 30))}`;
    const record = placed.get(knowledgeId);
    if (!record) continue;
    const draft: ClaimDraft = {
      knowledgeId,
      subjectId: rng() < 0.9 ? pick(record.subjects) : pick(['s0', 's1', 'n0']),
      aspect: pick(['zz-a0', 'zz-a1']),
      value: pick(['zz-v0', 'zz-v1', 'zz-v2']),
    };
    const commandId = `claim-${String(seed)}-${String(i)}`;
    const result = await harness.submit(
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId },
        claim: { subjectId: draft.subjectId, aspect: draft.aspect, value: draft.value },
      },
      { commandId },
    );
    const allowed =
      !['WORLD_TRUTH', 'DM'].includes(record.scope) &&
      !['UNKNOWN'].includes(record.type) &&
      record.subjects.includes(draft.subjectId) &&
      !claims.has(knowledgeId);
    expect(
      result.status === 'accepted',
      `${JSON.stringify(draft)} on ${JSON.stringify(record)}`,
    ).toBe(allowed);
    if (allowed) {
      claims.set(knowledgeId, draft);
      claimCommands.set(commandId, knowledgeId);
    }
  }
  return { harness, placed, claims, claimCommands, party, rng };
}

function expectedPairs(
  placed: ReadonlyMap<string, Placed>,
  claims: ReadonlyMap<string, ClaimDraft>,
  party: ReadonlySet<string>,
): Map<string, Viewer> {
  const pairs = new Map<string, Viewer>();
  const entries = [...claims.values()];
  for (const [i, a] of entries.entries()) {
    for (const b of entries.slice(i + 1)) {
      if (a.subjectId !== b.subjectId || a.aspect !== b.aspect || a.value === b.value) continue;
      const scope = oracleJoint(
        placed.get(a.knowledgeId)?.scope ?? 'DM',
        placed.get(b.knowledgeId)?.scope ?? 'DM',
        party,
      );
      if (scope === null) continue;
      const [x, y] = [a.knowledgeId, b.knowledgeId].sort();
      pairs.set(`${scope}|${String(x)}|${String(y)}`, scope);
    }
  }
  return pairs;
}

async function verify(run: Awaited<ReturnType<typeof scenario>>) {
  const { harness, placed, claims, party } = run;
  const state = await harness.state();
  const pairs = expectedPairs(placed, claims, party);

  // 1. Exactly the oracle's pairs, each a CONTRADICTION in the joint scope.
  expect(new Set(state.epistemics.contradictions.keys())).toEqual(new Set(pairs.keys()));
  for (const [key, id] of state.epistemics.contradictions) {
    const record = state.knowledge.get(id);
    const [, a, b] = key.split('|');
    expect(record?.knowledgeType).toBe('CONTRADICTION');
    expect(JSON.stringify(scopeObject(pairs.get(key) ?? 'DM'))).toBe(JSON.stringify(record?.scope));
    expect(record?.relations).toEqual([
      { type: 'CONTRADICTS', knowledgeId: a },
      { type: 'CONTRADICTS', knowledgeId: b },
    ]);
  }
  // 2. No record ever changes type.
  for (const [id, record] of placed)
    expect(state.knowledge.get(id)?.knowledgeType).toBe(record.type);

  // 3. Every perspective sees exactly its records and contradictions; no claim slug.
  const viewers: [PerspectiveRequest, Viewer][] = [
    [{ kind: 'PUBLIC' }, 'PUBLIC'],
    [{ kind: 'PARTY' }, 'PARTY'],
    ...CHARACTERS.map((c): [PerspectiveRequest, Viewer] => [
      { kind: 'CHARACTER', characterId: c },
      `CHARACTER:${c}`,
    ]),
    ...NPCS.map((n): [PerspectiveRequest, Viewer] => [{ kind: 'NPC', npcId: n }, `NPC:${n}`]),
  ];
  const contradictionScopes = new Map(
    [...state.epistemics.contradictions].map(([key, id]) => [id, pairs.get(key) ?? 'DM']),
  );
  for (const [request, viewer] of viewers) {
    const access = resolvePerspective(state, DM, request);
    if (!access.ok) throw new Error('DM must resolve every perspective');
    const p = access.perspective;
    const visible = new Set(
      [...placed].filter(([, r]) => audience(r.scope, party).has(viewer)).map(([id]) => id),
    );
    const visibleContradictions = new Set(
      [...contradictionScopes]
        .filter(([, scope]) => audience(scope, party).has(viewer))
        .map(([id]) => id),
    );
    const list = listKnowledge(state, p);
    expect(list.ok && new Set(list.knowledge.map((k) => k.knowledgeId))).toEqual(
      new Set([...visible, ...visibleContradictions]),
    );
    const ids = [...state.knowledge.keys()];
    const output = JSON.stringify([
      list,
      ids.map((id) => getKnowledge(state, p, id)),
      ids.map((id) => relatedKnowledge(state, p, id, 3)),
      [...state.entities.keys()].map((id) => entityKnowledge(state, p, id)),
    ]);
    for (const id of placed.keys()) {
      expect(output.includes(`CANARY_${id}_X`), `${viewer} vs ${id}`).toBe(visible.has(id));
    }
    expect(output).not.toContain('zz-');
    expect(output).not.toContain('"claim"');
    // Contradiction statements name only entities the viewer knows.
    const known = new Set<string>();
    for (const id of visible) {
      const r = placed.get(id);
      r?.subjects.forEach((s) => known.add(s));
      if (r?.attributedTo) known.add(r.attributedTo);
    }
    for (const id of visibleContradictions) {
      for (const name of state.knowledge.get(id)?.statement.match(/NAME_(\w+?)_X/g) ?? []) {
        expect(known.has(name.slice(5, -2)), `${viewer} learns ${name}`).toBe(true);
      }
    }
  }
  // 4. Replay and integrity.
  const { history } = await harness.snapshot();
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  // 5. Every still-effective command re-decides identically (Gate 02 oracle).
  const log = await harness.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, { state, history }, () => 3)).toBeNull();
  return state.epistemics.contradictions.size;
}

describe('randomized epistemic integrity', () => {
  it.each([5, 17, 23, 61, 89, 2026])('seed %i', async (seed) => {
    const run = await scenario(seed);
    const found = await verify(run);
    expect(found).toBeGreaterThan(0);

    let undone = 0;
    let blocked = 0;
    // Undo random claims: an undo succeeds only if no standing contradiction
    // created by another command depends on it; the oracle still holds after.
    for (const [commandId, knowledgeId] of [...run.claimCommands].reverse()) {
      if (run.rng() < 0.5) continue;
      const result = await run.harness.submit({ type: 'UndoCommand', targetCommandId: commandId });
      if (result.status === 'accepted') {
        run.claims.delete(knowledgeId);
        undone += 1;
      } else {
        expect(result.status === 'rejected' && result.code).toBe('UNDO_UNSAFE');
        blocked += 1;
      }
    }
    expect(undone + blocked).toBeGreaterThan(0);
    await verify(run);
  });
});
