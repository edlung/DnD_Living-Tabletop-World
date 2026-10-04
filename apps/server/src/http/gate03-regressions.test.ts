import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { blockersOf, post } from '../testing/gate02-scenarios.ts';
import {
  ELOWEN,
  RAIDER_1,
  SHAMAN,
  encounter,
  expectAccepted,
  playerReads,
  shamanCastsAtElowen,
  startAmbush,
} from '../testing/gate03-scenarios.ts';
import { TOKENS, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * Gate 03 regressions over HTTP (reviews/ASTRA_GATE_03_REPORT.md), on the
 * in-memory engine; `gate03-regressions.integration.test.ts` repeats them on
 * PostgreSQL across a restart.
 */
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function ambush(withSeren = false) {
  const app = await ravenfordApp();
  apps.push(app);
  await startAmbush(app, 'g03', withSeren);
  return app;
}

describe('G03-H01 over HTTP', () => {
  it('refuses to reopen a countered window after the caster died, atomically, naming the blocker', async () => {
    const app = await ambush();
    const windowId = await shamanCastsAtElowen(app, 'h01');
    const answer = await expectAccepted(
      post(app, TOKENS.player, 'h01-counter', {
        type: 'UseReaction',
        combatantId: ELOWEN,
        windowId,
        reaction: 'counterspell',
      }),
    );
    const death = await expectAccepted(
      post(app, TOKENS.dm, 'h01-death', {
        type: 'ChangeEntityStatus',
        entityId: SHAMAN,
        status: 'dead',
      }),
    );
    const refused = await post(app, TOKENS.dm, 'h01-undo', {
      type: 'UndoCommand',
      targetCommandId: answer,
    });
    expect(refused.status).toBe(422);
    expect(blockersOf(refused.body)).toEqual([death]);
    expect((await encounter(app))?.reactionWindow).toBeNull();
  });
});

describe('G03-H03 over HTTP', () => {
  it.each([false, true])(
    'Detect Magic in combat (suspended: %s) never reaches past 30 ft',
    async (suspended) => {
      const app = await ambush(suspended);
      for (const [entityId, statement] of [
        [RAIDER_1, 'G03_NEAR_MAGIC'],
        [SHAMAN, 'G03_FAR_MAGIC'],
      ]) {
        await expectAccepted(
          post(app, TOKENS.dm, `clue-${entityId}`, {
            type: 'AddClue',
            entityId,
            method: 'magic',
            statement,
            subjects: [],
          }),
        );
      }
      await expectAccepted(
        post(app, TOKENS.player, 'detect', {
          type: 'CastSpell',
          combatantId: ELOWEN,
          spellId: 'detect-magic',
        }),
      );
      if (suspended) {
        const windowId = (await encounter(app))?.reactionWindow?.windowId;
        await expectAccepted(
          post(app, TOKENS.dm, 'close', { type: 'CloseReactionWindow', windowId }),
        );
      }
      const reads = await playerReads(app);
      expect(reads).toContain('G03_NEAR_MAGIC');
      expect(reads).not.toContain('G03_FAR_MAGIC');
    },
  );
});
