# Authoring permissions, consent and continuity

18 groups on an in-memory campaign through actual authenticated HTTP handlers. Covers the PUBLIC-only intent context, trace-sourced proposals, role checks, client-content injection, the generic-command bypass, five unsupported operation cases, atomic rejection, impossible knowledge times, an explicit repair option and invalidated revision confirmation, risk escalation, warnings, stale world state, provenance and replay/re-decision.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-1/regressions/AUTHORING_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ravenfordApp,
  seededEngine,
  testAiGateway,
  TOKENS,
  post,
  get,
  ASHEN_CIRCLE_ID,
} from './apps/server/src/testing/ravenford-app.ts';
import { createLocalProvider } from './packages/ai/src/index.ts';
import {
  replay,
  checkWorldIntegrity,
  redecideEffective,
  undoneBeneathEarlierWriters,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const engine = await seededEngine();
const sent = [];
const local = createLocalProvider();
const ai = testAiGateway({
  id: 'captured-local',
  generate: async (r) => {
    sent.push(structuredClone(r));
    return local.generate(r);
  },
});
const app = await ravenfordApp(engine, ai);
const base = '/campaigns/ravenford/authoring/proposals';
const results = {};
let serial = 0;
const npc = (id, name = id) => ({
  type: 'CreateEntity',
  entityId: id,
  kind: 'npc',
  name,
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
});
const confirmation = { riskLevel: 'L3', acknowledgedWarnings: [] };
const snap = () => engine.load('ravenford');
const dm = async (command) => {
  const r = await post(
    app,
    '/campaigns/ravenford/commands',
    { commandId: `g04-authoring-${++serial}`, command },
    TOKENS.dm,
  );
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
const draft = async (commands) => {
  const r = await post(app, base, { summary: 'Independent Gate 04 probe.', commands }, TOKENS.dm);
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
};
const commit = (d, confirmed = confirmation) =>
  post(
    app,
    `${base}/${d.proposal.proposalId}/commit`,
    { revision: d.proposal.revision, confirmation: confirmed },
    TOKENS.dm,
  );
const refusal = async (name, commands, code) => {
  const before = await snap();
  const d = await draft(commands);
  const r = await commit(d);
  assert.equal(r.statusCode, 422, r.body);
  assert.equal(r.json().code, code);
  assert.deepEqual(await snap(), before);
  results[name] = {
    http: r.statusCode,
    code: r.json().code,
    issues: d.preview.issues.map((i) => i.code),
    atomic: true,
  };
  return d;
};
try {
  const before = await snap();
  const intent = await post(
    app,
    '/campaigns/ravenford/ai/intents',
    { text: 'Add a young guard near North Gate who saw the caravan leave.' },
    TOKENS.dm,
  );
  assert.equal(intent.statusCode, 200);
  assert.equal(intent.json().committable, false);
  assert.equal(intent.json().status, 'PROPOSED');
  assert.deepEqual(await snap(), before);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].task.context.scope, 'PUBLIC');
  assert.equal(sent[0].task.context.items.filter((i) => i.kind === 'record').length, 0);
  assert.ok(!JSON.stringify(sent).includes(ASHEN_CIRCLE_ID));
  results.publicIntent = {
    status: intent.json().status,
    scope: sent[0].task.context.scope,
    noKnowledgeRecords: true,
    secretEntityAbsent: true,
    canonicalUnchanged: true,
    request: sent[0],
  };
  const fromTrace = await post(app, base, { traceId: intent.json().traceId }, TOKENS.dm);
  assert.equal(fromTrace.statusCode, 201);
  const d = fromTrace.json();
  const id = d.proposal.proposalId;
  for (const [token, status] of [
    [TOKENS.player, 403],
    [TOKENS.outsider, 404],
  ]) {
    for (const [method, url, payload] of [
      ['POST', '/campaigns/ravenford/ai/intents', { text: 'Add a guard' }],
      ['GET', `/campaigns/ravenford/ai/traces/${intent.json().traceId}`, null],
      ['POST', base, { summary: 'x', commands: [npc('forged')] }],
      ['GET', `${base}/${id}`, null],
      ['POST', `${base}/${id}/revisions`, { basedOnRevision: 1, commands: [npc('forged')] }],
      ['POST', `${base}/${id}/commit`, { revision: 1, confirmation }],
      ['POST', `${base}/${id}/undo`, {}],
    ]) {
      const r =
        method === 'GET' ? await get(app, url, token) : await post(app, url, payload, token);
      assert.equal(r.statusCode, status, r.body);
    }
  }
  assert.equal(sent.length, 1);
  results.permissions = { routesPerRole: 7, roles: 2, noAdditionalProviderCalls: true };
  const injected = await post(
    app,
    `${base}/${id}/commit`,
    { revision: 1, confirmation, commands: [npc('forged')] },
    TOKENS.dm,
  );
  assert.equal(injected.statusCode, 400);
  assert.deepEqual(await snap(), before);
  results.clientContentInjection = { http: 400, atomic: true };
  const direct = await post(
    app,
    '/campaigns/ravenford/commands',
    {
      commandId: 'g04-bypass',
      command: {
        type: 'ApplyAuthoring',
        proposalId: id,
        revision: 1,
        summary: 'x',
        source: { kind: 'dm' },
        commands: [npc('forged')],
        confirmation,
      },
    },
    TOKENS.dm,
  );
  assert.equal(direct.statusCode, 400);
  results.directApplyBlocked = { http: 400 };
  const unsupported = [
    { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' },
    { type: 'AdvanceWorldTime', by: 1 },
    { ...npc('g04-item'), kind: 'item' },
    { type: 'UpdateEntityProfile', entityId: 'elowen-starwhisper', name: 'Rewritten hero' },
    {
      type: 'AddKnowledge',
      knowledgeId: 'g04-public',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'FACT',
      statement: 'Rewritten fact.',
      subjects: [],
      knownSince: null,
    },
  ];
  for (const [i, operation] of unsupported.entries())
    await refusal(`unsupported-${i}`, [npc(`g04-atomic-${i}`), operation], 'AUTHORING_UNSUPPORTED');
  await refusal(
    'invalid-testimony',
    [
      npc('g04-invalid'),
      {
        type: 'AddKnowledge',
        scope: { kind: 'NPC', npcId: 'g04-invalid' },
        knowledgeType: 'TESTIMONY',
        statement: 'Unattributed testimony.',
        subjects: [],
        knownSince: null,
      },
    ],
    'AUTHORING_INVALID',
  );
  const now = (await snap()).state.clock;
  const temporal = await refusal(
    'knowledge-before-subject',
    [
      npc('g04-older-holder'),
      {
        ...npc('g04-new-subject'),
        existsSince: now,
        placement: { locationId: 'north-gate', since: now },
      },
      {
        type: 'AddKnowledge',
        scope: { kind: 'NPC', npcId: 'g04-older-holder' },
        knowledgeType: 'FACT',
        statement: 'Knew before it existed.',
        subjects: ['g04-new-subject'],
        knownSince: now - 1,
      },
    ],
    'AUTHORING_INVALID',
  );
  const issue = temporal.preview.issues.find((i) => i.code === 'KNOWLEDGE_BEFORE_SUBJECT');
  assert.ok(issue);
  const option = issue.options.find((o) => o.kind === 'edit');
  assert.ok(option);
  const fixed = await post(
    app,
    `${base}/${temporal.proposal.proposalId}/revisions`,
    { basedOnRevision: 1, optionId: option.optionId },
    TOKENS.dm,
  );
  assert.equal(fixed.statusCode, 201);
  assert.equal(fixed.json().proposal.revision, 2);
  assert.equal(fixed.json().preview.committable, true);
  const stale = await commit(temporal);
  assert.equal(stale.statusCode, 409);
  const repaired = await commit(fixed.json(), fixed.json().preview.confirmation);
  assert.equal(repaired.statusCode, 200, repaired.body);
  results.explicitOption = { revision: 2, staleConfirmationHttp: 409, commitHttp: 200 };
  await dm(npc('g04-deceased'));
  await dm({ type: 'ChangeEntityStatus', entityId: 'g04-deceased', status: 'dead' });
  await refusal(
    'knowledge-after-death',
    [
      {
        type: 'AddKnowledge',
        scope: { kind: 'NPC', npcId: 'g04-deceased' },
        knowledgeType: 'FACT',
        statement: 'Learned after death.',
        subjects: [],
        knownSince: now,
      },
    ],
    'AUTHORING_INVALID',
  );
  const secret = await draft([
    npc('g04-secret-holder'),
    {
      type: 'AddKnowledge',
      scope: { kind: 'NPC', npcId: 'g04-secret-holder' },
      knowledgeType: 'SECRET',
      statement: 'G04_PRIVATE_CANARY',
      subjects: [],
      knownSince: null,
    },
  ]);
  const low = await commit(secret, { riskLevel: 'L2', acknowledgedWarnings: [] });
  assert.equal(low.json().code, 'CONFIRMATION_REQUIRED');
  const accepted = await commit(secret, secret.preview.confirmation);
  assert.equal(accepted.statusCode, 200);
  results.riskEscalation = { low: low.json().code, accepted: accepted.json().status };
  const toRename = await draft([
    { type: 'UpdateEntityProfile', entityId: 'mira-vale', name: 'Gate Four Mira' },
  ]);
  assert.ok(toRename.preview.warnings.some((w) => w.code === 'RENAME_KNOWN'));
  const warn = await commit(toRename);
  assert.equal(warn.json().code, 'CONFIRMATION_REQUIRED');
  const ack = await commit(toRename, toRename.preview.confirmation);
  assert.equal(ack.statusCode, 200);
  results.warningAcknowledgement = {
    unacknowledged: warn.json().code,
    acknowledged: ack.json().status,
  };
  const staleWorld = await draft([npc('g04-raced-id')]);
  await dm(npc('g04-raced-id'));
  const staleBefore = await snap();
  const changed = await commit(staleWorld, staleWorld.preview.confirmation);
  assert.equal(changed.json().code, 'AUTHORING_INVALID');
  assert.deepEqual(await snap(), staleBefore);
  results.staleWorld = { code: changed.json().code, atomic: true };
  const current = await snap();
  const log = await engine.commandLog('ravenford');
  assert.deepEqual(replay(current.history), current.state);
  assert.deepEqual(checkWorldIntegrity(current.state), []);
  assert.deepEqual(undoneBeneathEarlierWriters(current.state, current.history), []);
  assert.equal(
    redecideEffective(log, current, () => 0, createCombatEngine()),
    null,
  );
  results.audit = { replayEqual: true, redecision: null, integrity: [] };
  for (const row of log.filter((c) => c.command.type === 'ApplyAuthoring')) {
    assert.equal(row.actor.actorId, 'dm-ravenford');
    assert.ok(row.command.confirmation);
    assert.ok(row.command.proposalId);
  }
  results.provenance = {
    commits: log.filter((c) => c.command.type === 'ApplyAuthoring').length,
    dmActorAndConfirmation: true,
  };
} finally {
  await app.close();
}
await mkdir('reviews/evidence/gate-05/retest-1/regressions', { recursive: true });
await writeFile(
  'reviews/evidence/gate-05/retest-1/regressions/authoring-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify({ groups: Object.keys(results).length, allAssertionsPassed: true }));
```
