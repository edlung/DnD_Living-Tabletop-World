# Earlier-writer contract, mixed histories and races

18 groups using five genuine repository fixtures from four distinct historical revisions. Enumerates all 547 effective undoable commands, checks exact blocker sets and atomic refusals, then tests unrelated and dependent current commands on each history. Tests both race orders between undo and a new dependency. A separate synthetic, in-memory checker test verifies that later removal of a blocker cannot erase an earlier violation, and that old compensations remain exempt. Synthetic checker records are never persisted or represented as genuine writer output. Uses deterministic in-memory worlds; historical fixture files remain unchanged.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-4/LEGACY_BOUNDARY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  historicalWorld,
  loadHistory,
  eventFromRow,
} from './packages/combat/src/testing/history.ts';
import { forkWorld } from './packages/combat/src/testing/fork.ts';
import { rivalEngine } from './packages/combat/src/testing/racing.ts';
import { CAMPAIGN, DM } from './packages/combat/src/testing/road.ts';
import {
  replay,
  checkWorldIntegrity,
  redecideEffective,
  undoneBeneathEarlierWriters,
} from './packages/domain/src/index.ts';
import { schemaVersionOf, writtenEarlier } from './packages/domain/src/kernel/event-versions.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { reactionWindowViolations } from './packages/combat/src/reactions/invariants.ts';
const results = {};
const names = [
  '88d8137-gate03-retest1',
  '88d8137-outside-casts',
  'b38cbbc-outside-casts',
  '429e2a2-gaps',
  '017ab0b-investigation',
];
const ok = (r) => {
  assert.equal(r.status, 'accepted', JSON.stringify(r));
  return r;
};
const undo = (w, id) => w.dm({ type: 'UndoCommand', targetCommandId: id });
const effective = (s) =>
  [...s.commands.values()].filter((c) => c.commandType !== 'UndoCommand' && c.undoneBy === null);
const note = (statement, subjects = []) => ({
  type: 'AddKnowledge',
  scope: { kind: 'DM' },
  knowledgeType: 'SECRET',
  statement,
  subjects,
  knownSince: null,
});
async function audit(w) {
  const snap = await w.engine.load(CAMPAIGN);
  assert.deepEqual(replay(snap.history), snap.state);
  assert.deepEqual(checkWorldIntegrity(snap.state), []);
  assert.deepEqual(reactionWindowViolations(snap.state), []);
  assert.deepEqual(undoneBeneathEarlierWriters(snap.state, snap.history), []);
  assert.equal(
    redecideEffective(await w.engine.commandLog(CAMPAIGN), snap, () => 0, createCombatEngine()),
    null,
  );
  return {
    replayEqual: true,
    structuralViolations: [],
    windowViolations: [],
    earlierWriterViolations: [],
    redecision: null,
  };
}
let exhaustive = 0;
for (const name of names) {
  const fixture = await loadHistory(name);
  const original = await historicalWorld(fixture);
  const state = await original.state();
  const commands = effective(state);
  assert.ok(fixture.events.map(eventFromRow).every(writtenEarlier));
  // Enumerate every effective undoable command, including the old seed and DM commands.
  let blocked = 0,
    accepted = 0;
  const types = new Set();
  for (const target of commands.filter((c) => c.commandType !== 'CreateCampaign')) {
    const copy = await forkWorld(original, 600);
    const before = await copy.state();
    const result = await undo(copy, target.commandId);
    const expected = commands
      .filter((c) => c.firstSequence > target.lastSequence)
      .map((c) => c.commandId);
    types.add(target.commandType);
    exhaustive++;
    if (expected.length) {
      assert.equal(result.code, 'UNDO_UNSAFE');
      assert.deepEqual(
        result.details.blockers.map((b) => b.commandId),
        expected,
      );
      assert.deepEqual(await copy.state(), before);
      blocked++;
    } else {
      ok(result);
      accepted++;
      await audit(copy);
    }
  }
  results[`all-old-${name}`] = {
    commandsTried: blocked + accepted,
    blocked,
    accepted,
    commandTypes: [...types],
    exactBlockers: true,
    atomicRefusals: true,
  };
  // New commands use ordinary dependencies, and do not force global reverse order.
  const mixed = await forkWorld(original, 601);
  const first = ok(await mixed.dm(note('First independent current note')));
  const second = ok(await mixed.dm(note('Second independent current note')));
  const newEvents = (await mixed.engine.load(CAMPAIGN)).history.filter(
    (e) => e.sequence > state.version,
  );
  assert.ok(
    newEvents.every((e) => !writtenEarlier(e) && e.schemaVersion === schemaVersionOf(e.type)),
  );
  ok(await undo(mixed, first.commandId));
  const latest = commands.at(-1);
  ok(await undo(mixed, latest.commandId));
  assert.equal((await mixed.state()).commands.get(second.commandId).undoneBy, null);
  results[`mixed-unrelated-${name}`] = {
    oldLatest: latest.commandId,
    currentEarlierUndo: 'accepted',
    oldLatestUndo: 'accepted',
    laterCurrentNoteStillEffective: true,
    ...(await audit(mixed)),
  };
  // Reach the newest old creation in reverse order, then put a current dependency on it.
  const dependent = await forkWorld(original, 602);
  const target = [...commands].reverse().find((c) => c.commandType === 'CreateEntity');
  assert.ok(target);
  const later = commands.filter((c) => c.firstSequence > target.lastSequence).reverse();
  for (const c of later) ok(await undo(dependent, c.commandId));
  const entityEvent = (await dependent.engine.load(CAMPAIGN)).history.find(
    (e) => e.causation.commandId === target.commandId && e.type === 'EntityCreated',
  );
  assert.ok(entityEvent);
  const entityId = entityEvent.payload.entityId;
  const read = ok(await dependent.dm(note('Current knowledge names the old entity', [entityId])));
  const unrelated = ok(await dependent.dm(note('Unrelated current note remains')));
  const before = await dependent.state();
  const refused = await undo(dependent, target.commandId);
  assert.equal(refused.code, 'UNDO_UNSAFE');
  assert.deepEqual(
    refused.details.blockers.map((b) => b.commandId),
    [read.commandId],
  );
  assert.deepEqual(await dependent.state(), before);
  ok(await undo(dependent, read.commandId));
  ok(await undo(dependent, target.commandId));
  assert.equal((await dependent.state()).commands.get(unrelated.commandId).undoneBy, null);
  results[`mixed-dependent-${name}`] = {
    oldCreation: target.commandId,
    oldCommandsReversed: later.length,
    currentBlocker: read.commandId,
    atomic: true,
    recovery: true,
    ...(await audit(dependent)),
  };
}
// The checker must remember whether a blocker stood WHEN an undo happened.
{
  const fixture = await loadHistory(names[1]);
  const events = fixture.events.map(eventFromRow);
  const state = replay(events);
  const commands = effective(state);
  const [b, a] = [...commands].reverse();
  const last = events.at(-1);
  const synthetic = (target, offset, version, id) => ({
    ...last,
    sequence: last.sequence + offset,
    eventId: `00000000-0300-4000-8000-${String(offset).padStart(12, '0')}`,
    schemaVersion: version,
    type: 'CommandUndone',
    payload: {
      targetCommandId: target.commandId,
      targetCommandType: target.commandType,
      restores: [],
    },
    causation: { commandId: id, commandType: 'UndoCommand', actor: DM },
  });
  const bad = synthetic(a, 1, 2, 'r4-synthetic-bad');
  const later = synthetic(b, 2, 2, 'r4-synthetic-later');
  const badHistory = [...events, bad];
  const laterHistory = [...badHistory, later];
  assert.deepEqual(undoneBeneathEarlierWriters(replay(badHistory), badHistory), [
    'r4-synthetic-bad',
  ]);
  assert.deepEqual(undoneBeneathEarlierWriters(replay(laterHistory), laterHistory), [
    'r4-synthetic-bad',
  ]);
  const newest = [...events, synthetic(b, 1, 2, 'r4-synthetic-newest')];
  assert.deepEqual(undoneBeneathEarlierWriters(replay(newest), newest), []);
  const grandfathered = [...events, synthetic(a, 1, 1, 'r4-synthetic-old')];
  assert.deepEqual(undoneBeneathEarlierWriters(replay(grandfathered), grandfathered), []);
  results.checker = {
    syntheticOnly: true,
    badUndoDetected: true,
    laterRemovalDoesNotEraseViolation: true,
    newestAllowed: true,
    oldCompensationExempt: true,
  };
}
// Race current dependency creation against undo of the newest old entity: both serial orders.
for (const first of ['undo', 'knowledge']) {
  const fixture = await loadHistory(names[1]);
  const w = await historicalWorld(fixture);
  const state = await w.state();
  const commands = effective(state);
  const target = [...commands].reverse().find((c) => c.commandType === 'CreateEntity');
  for (const c of commands.filter((c) => c.firstSequence > target.lastSequence).reverse())
    ok(await undo(w, c.commandId));
  const event = (await w.engine.load(CAMPAIGN)).history.find(
    (e) => e.causation.commandId === target.commandId && e.type === 'EntityCreated',
  );
  const entityId = event.payload.entityId;
  const reverse = { type: 'UndoCommand', targetCommandId: target.commandId };
  const knowledge = note('Racing dependency', [entityId]);
  const rival = rivalEngine(w.store, 901);
  await rival.engine.load(CAMPAIGN);
  let winner;
  rival.racing.interleave(async () => {
    winner = ok(await w.dm(first === 'undo' ? reverse : knowledge));
  });
  const loser = await rival.engine.execute({
    campaignId: CAMPAIGN,
    commandId: 'r4-race',
    actor: DM,
    command: first === 'undo' ? knowledge : reverse,
  });
  assert.equal(rival.racing.conflicts, 1);
  assert.equal(loser.status, 'rejected');
  if (first === 'knowledge') assert.equal(loser.code, 'UNDO_UNSAFE');
  assert.equal((await w.state()).entities.has(entityId), first === 'knowledge');
  results[`race-${first}`] = {
    winner: winner.commandId,
    loserCode: loser.code,
    conflicts: 1,
    ...(await audit(w)),
  };
}
await mkdir('reviews/evidence/gate-03/retest-4', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-4/legacy-boundary-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    groups: Object.keys(results).length,
    exhaustiveUndoAttempts: exhaustive,
    allAssertionsPassed: true,
  }),
);
```
