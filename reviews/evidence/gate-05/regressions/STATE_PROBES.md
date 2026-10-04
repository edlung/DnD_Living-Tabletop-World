# Disclosure, Insight and dependency-preserving undo

44 cases on deterministic in-memory worlds: 40 combinations of four knowledge types, five attitudes and shown/not-shown evidence; three generated-name undo checks; and an Insight failure/empty comparison with repeat refusal. Accepted answers protect their source, relevant attitude and unlocking showing; explicit reverse recovery, replay, integrity and effective-command re-decision are checked.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/regressions/STATE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  investigationWorld,
  DM,
  ELOWEN,
  CAMPAIGN,
} from './packages/domain/src/investigation/testing/world.ts';
import {
  replay,
  checkWorldIntegrity,
  redecideEffective,
  undoneBeneathEarlierWriters,
} from './packages/domain/src/index.ts';
const results = {};
const ok = (r) => {
  assert.equal(r.status, 'accepted', JSON.stringify(r));
  return r;
};
const undo = (w, r) => w.submit({ type: 'UndoCommand', targetCommandId: r.commandId }, DM);
async function audit(w) {
  const s = await w.engine.load(CAMPAIGN);
  assert.deepEqual(replay(s.history), s.state);
  assert.deepEqual(checkWorldIntegrity(s.state), []);
  assert.deepEqual(undoneBeneathEarlierWriters(s.state, s.history), []);
  assert.equal(
    redecideEffective(await w.engine.commandLog(CAMPAIGN), s, () => 0),
    null,
  );
  return true;
}
async function setup(kind = 'FACT') {
  const w = await investigationWorld();
  const creation = ok(
    await w.submit(
      {
        type: 'CreateEntity',
        entityId: 'g04-informant',
        kind: 'npc',
        name: 'Review Informant',
        existsSince: null,
        placement: { locationId: 'market-square', since: null },
      },
      DM,
    ),
  );
  const knowledge = ok(
    await w.submit(
      {
        type: 'AddKnowledge',
        knowledgeId: 'g04-account',
        scope: { kind: 'NPC', npcId: 'g04-informant' },
        knowledgeType: kind,
        statement: 'G04_GUARDED_ACCOUNT',
        subjects: ['guild-caravan'],
        knownSince: null,
      },
      DM,
    ),
  );
  const evidence = ok(
    await w.submit(
      {
        type: 'AddKnowledge',
        knowledgeId: 'g04-proof',
        scope: { kind: 'PARTY' },
        knowledgeType: 'EVIDENCE',
        statement: 'A caravan receipt.',
        subjects: ['guild-caravan'],
        knownSince: null,
      },
      DM,
    ),
  );
  return { w, creation, knowledge, evidence };
}
const ask = {
  type: 'AskAbout',
  characterId: ELOWEN,
  npcId: 'g04-informant',
  topicId: 'guild-caravan',
};
const show = {
  type: 'ShowEvidence',
  characterId: ELOWEN,
  npcId: 'g04-informant',
  knowledgeId: 'g04-proof',
};
for (const kind of ['FACT', 'SECRET', 'UNKNOWN', 'CONTRADICTION'])
  for (const attitude of ['HOSTILE', 'WARY', 'NEUTRAL', 'FRIENDLY', 'TRUSTED'])
    for (const shown of [false, true]) {
      const { w, knowledge } = await setup(kind);
      const relation =
        attitude === 'NEUTRAL'
          ? null
          : ok(await w.submit({ type: 'SetRelationship', npcId: 'g04-informant', attitude }, DM));
      const showing = shown ? ok(await w.submit(show)) : null;
      const before = await w.state();
      const answer = await w.submit(ask);
      const expected =
        kind === 'FACT' &&
        !['HOSTILE', 'WARY'].includes(attitude) &&
        (shown || attitude === 'TRUSTED');
      assert.equal(answer.status, expected ? 'accepted' : 'rejected');
      if (!expected) {
        assert.equal(answer.code, 'NO_EFFECT');
        assert.deepEqual(await w.state(), before);
      } else {
        const protectedBefore = await w.state();
        const refused = await undo(w, knowledge);
        assert.equal(refused.code, 'UNDO_UNSAFE');
        assert.deepEqual(await w.state(), protectedBefore);
        if (relation) assert.equal((await undo(w, relation)).code, 'UNDO_UNSAFE');
        if (showing && attitude !== 'TRUSTED')
          assert.equal((await undo(w, showing)).code, 'UNDO_UNSAFE');
        ok(await undo(w, answer));
        if (showing) ok(await undo(w, showing));
        if (relation) ok(await undo(w, relation));
        ok(await undo(w, knowledge));
      }
      results[`disclosure-${kind}-${attitude}-${shown}`] = {
        expectedShared: expected,
        result: answer.status,
        recovery: expected,
        audit: await audit(w),
      };
    }
for (const type of ['ShowEvidence', 'AskAbout', 'InsightCheck']) {
  const { w } = await setup();
  const rename = ok(
    await w.submit(
      { type: 'UpdateEntityProfile', entityId: 'g04-informant', name: 'Renamed Informant' },
      DM,
    ),
  );
  if (type === 'AskAbout')
    ok(
      await w.submit({ type: 'SetRelationship', npcId: 'g04-informant', attitude: 'TRUSTED' }, DM),
    );
  if (type === 'InsightCheck') w.roll(20);
  const result = ok(
    await w.submit(type === 'ShowEvidence' ? show : type === 'AskAbout' ? ask : { ...ask, type }),
  );
  const before = await w.state();
  const rejected = await undo(w, rename);
  assert.equal(rejected.code, 'UNDO_UNSAFE');
  assert.deepEqual(await w.state(), before);
  ok(await undo(w, result));
  ok(await undo(w, rename));
  results[`named-undo-${type}`] = { blocked: true, recovered: true, audit: await audit(w) };
}
{
  const outcomes = [];
  for (const hidden of [true, false]) {
    const w = await investigationWorld();
    if (hidden)
      ok(
        await w.submit(
          {
            type: 'AddKnowledge',
            scope: { kind: 'NPC', npcId: 'mira-vale' },
            knowledgeType: 'SECRET',
            statement: 'A private secret.',
            subjects: ['market-square'],
            knownSince: null,
          },
          DM,
        ),
      );
    w.roll(1, 1);
    const result = ok(
      await w.submit({
        type: 'InsightCheck',
        characterId: ELOWEN,
        npcId: 'mira-vale',
        topicId: 'market-square',
      }),
    );
    outcomes.push(result.outcome);
    assert.equal(
      (
        await w.submit({
          type: 'InsightCheck',
          characterId: ELOWEN,
          npcId: 'mira-vale',
          topicId: 'guild-caravan',
        })
      ).code,
      'ALREADY_ATTEMPTED',
    );
    await audit(w);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  results.insightFailure = {
    sameWithAndWithoutHiddenRecord: true,
    repeatBlocked: true,
    outcome: outcomes[0],
  };
}
await mkdir('reviews/evidence/gate-05/regressions', { recursive: true });
await writeFile(
  'reviews/evidence/gate-05/regressions/state-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify({ cases: Object.keys(results).length, allAssertionsPassed: true }));
```
