# Authoring revision races and retry conflicts

Four independent PostgreSQL cases: both edit/commit interleavings and both sequential controls. A ProposalStore wrapper pauses once after its real SELECT has returned a revision, completes the competing authenticated HTTP request, then resumes the first request. It never fabricates or alters a row; all revisions and canonical changes use the application API. The same successful commit is retried verbatim. Restarts confirm the stored revision and canonical name. These assertions deliberately reproduce G04-H01 and G04-M02: recipe success supports FAIL. Requires PostgreSQL and removes four owned databases. The AI proposal is produced by a scripted provider, not a live external service.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-04/AUTHORING_RACE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresProposalStore } from './apps/server/src/authoring/postgres-proposal-store.ts';
import { PostgresAiTraceStore } from './apps/server/src/ai/postgres-trace-store.ts';
import {
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
  TOKENS,
  post,
  get,
} from './apps/server/src/testing/ravenford-app.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  replay,
  checkWorldIntegrity,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const base = '/campaigns/ravenford/authoring/proposals';
const results = {};
const create = {
  type: 'CreateEntity',
  entityId: 'g04-revision-npc',
  kind: 'npc',
  name: 'Earlier approved name',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};
const confirm = { revision: 1, confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] } };
for (const mode of [
  'edit-during-commit',
  'commit-during-edit',
  'sequential-edit',
  'sequential-commit',
]) {
  const db = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: db.url });
  let app;
  try {
    const store = new PostgresEventStore(pool);
    let engine = await seededEngine(store);
    const raw = new PostgresProposalStore(pool);
    let interleave = null;
    const proposals = {
      append: (r) => raw.append(r),
      latest: async (...args) => {
        const value = await raw.latest(...args);
        if (interleave) {
          const action = interleave;
          interleave = null;
          await action();
        }
        return value;
      },
    };
    const ai = {
      ...testAiGateway({
        id: 'scripted',
        generate: async () => ({
          model: 'review-script',
          usage: null,
          output: { summary: 'Add the review NPC.', commands: [create] },
        }),
      }),
      traces: new PostgresAiTraceStore(pool),
    };
    app = await ravenfordApp(engine, ai, { ...testAuthoring(), proposals });
    const intent = await post(
      app,
      '/campaigns/ravenford/ai/intents',
      { text: 'Add a guard near North Gate.' },
      TOKENS.dm,
    );
    assert.equal(intent.statusCode, 200, intent.body);
    assert.equal(intent.json().status, 'PROPOSED');
    const draft = await post(app, base, { traceId: intent.json().traceId }, TOKENS.dm);
    assert.equal(draft.statusCode, 201, draft.body);
    const id = draft.json().proposal.proposalId;
    const path = `${base}/${id}`;
    const editBody = {
      basedOnRevision: 1,
      summary: 'Replace the earlier proposal.',
      commands: [{ ...create, name: 'Latest edited name' }],
    };
    let edited, committed;
    const edit = async () => {
      edited = await post(app, `${path}/revisions`, editBody, TOKENS.dm);
    };
    const commit = async () => {
      committed = await post(app, `${path}/commit`, confirm, TOKENS.dm);
    };
    if (mode === 'edit-during-commit') {
      interleave = edit;
      await commit();
    }
    if (mode === 'commit-during-edit') {
      interleave = commit;
      await edit();
    }
    if (mode === 'sequential-edit') {
      await edit();
      await commit();
    }
    if (mode === 'sequential-commit') {
      await commit();
      await edit();
    }
    if (mode.includes('during')) {
      assert.equal(edited.statusCode, 201, edited.body);
      assert.equal(committed.statusCode, 200, committed.body);
      assert.equal(committed.json().status, 'accepted');
    } else if (mode === 'sequential-edit') {
      assert.equal(edited.statusCode, 201);
      assert.equal(committed.statusCode, 409);
    } else {
      assert.equal(committed.statusCode, 200);
      assert.equal(edited.statusCode, 409);
    }
    const retry =
      committed.statusCode === 200 ? await post(app, `${path}/commit`, confirm, TOKENS.dm) : null;
    if (retry) assert.equal(retry.statusCode, 409);
    await app.close();
    engine = new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(88),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
    });
    app = await ravenfordApp(engine, ai, { ...testAuthoring(), proposals: raw });
    const view = await get(app, path, TOKENS.dm);
    assert.equal(view.statusCode, 200);
    const snap = await engine.load('ravenford');
    assert.deepEqual(replay(snap.history), snap.state);
    assert.deepEqual(checkWorldIntegrity(snap.state), []);
    if (mode.includes('during')) {
      assert.equal(view.json().proposal.revision, 2);
      assert.equal(view.json().proposal.commit.revision, 1);
      assert.equal(snap.state.entities.get(create.entityId).name, 'Earlier approved name');
    }
    results[mode] = {
      traceId: intent.json().traceId,
      proposalId: id,
      edit: { http: edited.statusCode, body: edited.json() },
      commit: { http: committed.statusCode, body: committed.json() },
      retry: retry ? { http: retry.statusCode, body: retry.json() } : null,
      afterRestart: {
        latestRevision: view.json().proposal.revision,
        committedRevision: view.json().proposal.commit?.revision ?? null,
        latestName: view.json().proposal.commands[0].name,
        canonicalName: snap.state.entities.get(create.entityId)?.name ?? null,
        status: view.json().proposal.status,
      },
      replayEqual: true,
    };
  } finally {
    if (app) await app.close();
    await pool.end();
    await db.drop();
  }
}
await mkdir('reviews/evidence/gate-04', { recursive: true });
await writeFile(
  'reviews/evidence/gate-04/authoring-race-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    cases: Object.keys(results).length,
    staleCommitRacesReproduced: 2,
    retryConflictConfirmed: 3,
  }),
);
```
