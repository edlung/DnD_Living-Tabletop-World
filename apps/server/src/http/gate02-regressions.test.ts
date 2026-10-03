import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ELOWEN,
  H01_VIEWS,
  assignAndAct,
  authorHiddenParent,
  blockersOf,
  discloseAndEnter,
  emptyInspectionChain,
  post,
  recallAt,
} from '../testing/gate02-scenarios.ts';
import { TOKENS, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';

/**
 * Gate 02 regressions over HTTP with in-memory storage
 * (reviews/ASTRA_GATE_02_REPORT.md). PostgreSQL and reload variants live in
 * `world-engine/gate02-regressions.integration.test.ts`.
 */
const apps: FastifyInstance[] = [];

async function fresh(): Promise<{ app: FastifyInstance; engine: WorldEngine }> {
  const engine = await seededEngine();
  const app = await ravenfordApp(engine);
  apps.push(app);
  return { app, engine };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('G02-H01 recall_hidden_parent_matches_absent_without_disclosing_containment', () => {
  it.each(H01_VIEWS)(
    '%s: hidden and nonexistent locations answer identically',
    async (perspective, token) => {
      const { app } = await fresh();
      await authorHiddenParent(app);
      const hidden = await recallAt(app, perspective, token, 'hidden-vault');
      const absent = await recallAt(app, perspective, token, 'missing-vault');
      expect(hidden).toEqual(absent);
      expect(hidden).toMatchObject({ status: 200, body: { total: 0, memories: [] } });
    },
  );

  it('keeps authorized nesting', async () => {
    const { app } = await fresh();
    await authorHiddenParent(app);
    const dm = await recallAt(app, 'DM', TOKENS.dm, 'hidden-vault');
    expect(dm).toMatchObject({ status: 200, body: { total: 1 } });
    const party = await recallAt(app, 'PARTY', TOKENS.player, 'ravenford');
    const square = await recallAt(app, 'PARTY', TOKENS.player, 'market-square');
    expect((party.body as { total: number }).total).toBeGreaterThanOrEqual(
      (square.body as { total: number }).total,
    );
    expect((square.body as { total: number }).total).toBeGreaterThan(0);
  });
});

describe('G02-H02 undo_sole_disclosure_is_blocked_after_enter_location', () => {
  it.each(['knowledge', 'memory'] as const)('%s variant', async (kind) => {
    const { app, engine } = await fresh();
    const { disclosureId, moveId } = await discloseAndEnter(app, kind, `h02-${kind}`);
    const before = (await engine.load('ravenford'))?.state;

    const undone = await post(app, TOKENS.dm, `h02-${kind}-undo`, {
      type: 'UndoCommand',
      targetCommandId: disclosureId,
    });
    expect(undone.status).toBe(422);
    expect(undone.body).toMatchObject({ status: 'rejected', code: 'UNDO_UNSAFE' });
    const blockers =
      undone.body.status === 'rejected'
        ? (undone.body.details?.['blockers'] as { commandId: string }[])
        : [];
    expect(blockers.map((b) => b.commandId)).toEqual([moveId]);
    expect((await engine.load('ravenford'))?.state).toEqual(before);

    expect(
      (
        await post(app, TOKENS.dm, `h02-${kind}-undo-move`, {
          type: 'UndoCommand',
          targetCommandId: moveId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(app, TOKENS.dm, `h02-${kind}-undo-reveal`, {
          type: 'UndoCommand',
          targetCommandId: disclosureId,
        })
      ).status,
    ).toBe(200);
    expect(
      (await engine.load('ravenford'))?.state.entities.get(ELOWEN)?.placement?.locationId,
    ).toBe('market-square');
  });
});

describe('G02-H03 undo_controlling_assignment_is_blocked_by_player_action', () => {
  it.each(['move', 'hypothesis'] as const)('%s', async (action) => {
    const { app, engine } = await fresh();
    const { assignmentId, actionId } = await assignAndAct(app, action, `h03-${action}`);
    const before = (await engine.load('ravenford'))?.state;
    const undone = await post(app, TOKENS.dm, `h03-${action}-undo`, {
      type: 'UndoCommand',
      targetCommandId: assignmentId,
    });
    expect(undone.status).toBe(422);
    expect(blockersOf(undone.body)).toEqual([actionId]);
    expect((await engine.load('ravenford'))?.state).toEqual(before);
    expect(
      (
        await post(app, TOKENS.dm, `h03-${action}-undo-act`, {
          type: 'UndoCommand',
          targetCommandId: actionId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(app, TOKENS.dm, `h03-${action}-undo-assign`, {
          type: 'UndoCommand',
          targetCommandId: assignmentId,
        })
      ).status,
    ).toBe(200);
    expect((await engine.load('ravenford'))?.state.roster.has('guest-character')).toBe(false);
  });
});

describe('G02-M01 empty_inspection_does_not_strand_dependency_undo', () => {
  it('unwinds inspection, move and disclosure in dependency order', async () => {
    const { app, engine } = await fresh();
    const { revealId, moveId, inspectId } = await emptyInspectionChain(app, 'm01');
    const undo = (key: string, target: string) =>
      post(app, TOKENS.dm, key, { type: 'UndoCommand', targetCommandId: target });
    expect(blockersOf((await undo('m01-u1', revealId)).body)).toEqual([moveId]);
    expect(blockersOf((await undo('m01-u2', moveId)).body)).toEqual([inspectId]);
    for (const [key, target] of [
      ['m01-u3', inspectId],
      ['m01-u4', moveId],
      ['m01-u5', revealId],
    ] as const) {
      expect((await undo(key, target)).status, key).toBe(200);
    }
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.entities.get(ELOWEN)?.placement?.locationId).toBe('market-square');
    expect(state?.knowledge.has('empty-route')).toBe(false);
  });
});
