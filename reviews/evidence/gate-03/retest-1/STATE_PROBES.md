# Gate 03, Retest 1 — Independent state retest

32 isolated scenarios: original fixes, reverse recovery, both race orders, range boundaries and completion paths, adjacent authoring/negative results, and G03-H04 with no-fight controls.

Run from the repository root with installed dependencies and a Node version supporting TypeScript stripping:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-1/STATE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

The original-finding assertions require safe behavior. Assertions labelled **H04** deliberately confirm the remaining defect at `88d8137401451dd6a6d6703217bf53e273a2ede4`. A successful recipe run means the evidence is reproduced, not that Gate 03 passes. Scripts write only their result JSON under this retest directory; they do not change implementation or existing tests. Scripted timestamps are fixture data. Format regenerated JSON with Prettier before committing.

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  roadWorld,
  startAmbush,
  ELOWEN,
  SHAMAN,
  CAMPAIGN,
  DM,
  PLAYER,
  openWindowId,
} from './packages/combat/src/testing/road.ts';
import {
  SEREN,
  addSeren,
  withSeren,
  cast,
  ignore,
  counterspell,
  closeWindow,
  shamanCastsAtElowen,
} from './packages/combat/src/testing/reactions.ts';
import { rivalEngine } from './packages/combat/src/testing/racing.ts';
import { checkWorldIntegrity, replay, redecideEffective } from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { reactionWindowViolations } from './packages/combat/src/reactions/invariants.ts';
const results = {};
const ok = (r) => {
  assert.equal(r.status, 'accepted', JSON.stringify(r));
  return r;
};
const undo = (w, r) => w.dm({ type: 'UndoCommand', targetCommandId: r.commandId });
async function audit(w, expectDivergence = false) {
  const snap = await w.engine.load(CAMPAIGN);
  assert.deepEqual(replay(snap.history), snap.state);
  assert.deepEqual(checkWorldIntegrity(snap.state), []);
  assert.deepEqual(reactionWindowViolations(snap.state), []);
  const mismatch = redecideEffective(
    await w.engine.commandLog(CAMPAIGN),
    snap,
    () => 0,
    createCombatEngine(),
  );
  if (expectDivergence) assert.notEqual(mismatch, null);
  else assert.equal(mismatch, null, JSON.stringify(mismatch));
  return {
    replayEqual: true,
    structuralViolations: [],
    windowViolations: [],
    redecision: mismatch,
  };
}
async function unsafe(w, target, blocker) {
  const before = await w.state();
  const response = await undo(w, target);
  assert.equal(response.code, 'UNDO_UNSAFE', JSON.stringify(response));
  const blockers = response.details.blockers.map((b) => b.commandId);
  assert.deepEqual(blockers, [blocker.commandId]);
  assert.deepEqual(await w.state(), before);
  return { code: response.code, blockers, atomic: true };
}
async function two() {
  const w = await roadWorld();
  await addSeren(w);
  ok(await startAmbush(w, [17, 3, 2, 1, 15, 5], withSeren()));
  return w;
}
// Original H01 plus each way a single-candidate window can close.
for (const mode of ['counter', 'decline', 'dm-close', 'failed-counter']) {
  const w = await roadWorld();
  ok(await startAmbush(w));
  const { windowId } = await shamanCastsAtElowen(w);
  w.roll(20, mode === 'counter' ? 1 : 20);
  const answer = ok(
    await (mode === 'dm-close'
      ? w.dm(closeWindow(windowId))
      : w.submit(mode === 'decline' ? ignore(ELOWEN, windowId) : counterspell(ELOWEN, windowId))),
  );
  ok(
    await w.dm({
      type: 'AddKnowledge',
      scope: { kind: 'DM' },
      knowledgeType: 'SECRET',
      statement: 'Retest unrelated note',
      subjects: [],
      knownSince: null,
    }),
  );
  const edit = ok(await w.dm({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' }));
  const refusal = await unsafe(w, answer, edit);
  ok(await undo(w, edit));
  ok(await undo(w, answer));
  assert.equal((await w.state()).reactionWindows.get(windowId).status, 'open');
  ok(await w.dm(closeWindow(windowId)));
  results[`H01-${mode}`] = { ...refusal, recovery: 'accepted', ...(await audit(w)) };
}
// Original adjacent character-caster case.
{
  const w = await two();
  ok(await w.submit(cast(ELOWEN, 'detect-magic')));
  const windowId = await openWindowId(w);
  w.roll(20, 1);
  const answer = ok(await w.dm(counterspell(SEREN, windowId)));
  const sheet = (await w.state()).characterSheets.get(ELOWEN);
  const edit = ok(
    await w.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['incapacitated'] },
    }),
  );
  const refusal = await unsafe(w, answer, edit);
  ok(await undo(w, edit));
  ok(await undo(w, answer));
  ok(await w.dm(ignore(SEREN, windowId)));
  results.H01Character = { ...refusal, recovery: 'accepted', ...(await audit(w)) };
}
// A clock change must also block reopening, and can be undone explicitly.
{
  const w = await roadWorld();
  ok(await startAmbush(w));
  const { windowId } = await shamanCastsAtElowen(w);
  w.roll(20, 1);
  const answer = ok(await w.submit(counterspell(ELOWEN, windowId)));
  const time = ok(await w.dm({ type: 'AdvanceWorldTime', by: 60 }));
  const refusal = await unsafe(w, answer, time);
  ok(await undo(w, time));
  ok(await undo(w, answer));
  results.H01Clock = { ...refusal, ...(await audit(w)) };
}
// Race reopening against a status edit: both serial orders preserve the boundary.
for (const first of ['undo', 'edit']) {
  const w = await roadWorld();
  ok(await startAmbush(w));
  const { windowId } = await shamanCastsAtElowen(w);
  w.roll(20, 1);
  const answer = ok(await w.submit(counterspell(ELOWEN, windowId)));
  const rival = rivalEngine(w.store, 77);
  await rival.engine.load(CAMPAIGN);
  const edit = { type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' };
  const reverse = { type: 'UndoCommand', targetCommandId: answer.commandId };
  rival.racing.interleave(() => w.dm(first === 'undo' ? reverse : edit));
  const second = await rival.engine.execute({
    commandId: 'g03-race',
    campaignId: CAMPAIGN,
    actor: DM,
    command: first === 'undo' ? edit : reverse,
  });
  assert.equal(rival.racing.conflicts, 1);
  assert.equal(second.code, first === 'undo' ? 'REACTION_PENDING' : 'UNDO_UNSAFE');
  results[`H01-race-${first}`] = {
    code: second.code,
    conflicts: rival.racing.conflicts,
    ...(await audit(w)),
  };
}
// Original H02 miss and target-condition variant, with safe reverse recovery.
for (const condition of [false, true]) {
  const w = await two();
  const sheet = (await w.state()).characterSheets.get(SEREN);
  const edit = ok(
    await w.dm({
      type: 'SetCharacterSheet',
      entityId: SEREN,
      sheet: { ...sheet, ...(condition ? { conditions: ['prone'] } : { armorClass: 30 }) },
    }),
  );
  w.roll(20, ...(condition ? [2, 2] : [10]));
  const attack = ok(
    await w.submit({ type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: SEREN }),
  );
  assert.equal(attack.outcome.hit, false);
  const refusal = await unsafe(w, edit, attack);
  ok(await undo(w, attack));
  ok(await undo(w, edit));
  results[`H02-${condition ? 'condition' : 'armor'}`] = {
    ...refusal,
    recovery: 'accepted',
    ...(await audit(w)),
  };
}
// Original H03 and adjacent range boundaries, all completion paths.
for (const mode of ['direct', 'decline', 'dm-close', 'countered'])
  for (const distance of [30, 35, 50]) {
    const w = await roadWorld();
    if (mode !== 'direct') await addSeren(w);
    ok(
      await startAmbush(w, mode === 'direct' ? undefined : [17, 3, 2, 1, 15, 5], (command) => {
        const altered = {
          ...command,
          combatants: command.combatants.map((c) =>
            c.entityId === SHAMAN ? { ...c, position: { x: 2 + distance / 5, y: 1 } } : c,
          ),
        };
        return mode === 'direct' ? altered : withSeren()(altered);
      }),
    );
    const marker = `R1_MAGIC_${mode}_${distance}`;
    ok(
      await w.dm({
        type: 'AddClue',
        entityId: SHAMAN,
        method: 'magic',
        statement: marker,
        subjects: [],
      }),
    );
    ok(await w.submit(cast(ELOWEN, 'detect-magic')));
    if (mode !== 'direct') {
      const id = await openWindowId(w);
      w.roll(20, 1);
      ok(
        await w.dm(
          mode === 'decline'
            ? ignore(SEREN, id)
            : mode === 'countered'
              ? counterspell(SEREN, id)
              : closeWindow(id),
        ),
      );
    }
    const s = await w.state();
    const knowledge = [...s.knowledge.values()].some((k) => k.statement === marker);
    const memory = [...s.memories.values()].some((m) => m.summary.includes(marker));
    const expected = distance <= 30 && mode !== 'countered';
    assert.equal(knowledge, expected);
    assert.equal(memory, expected);
    results[`H03-${mode}-${distance}`] = { knowledge, memory, expected, ...(await audit(w)) };
  }
// No-square entities are excluded until the encounter ends.
{
  const w = await roadWorld();
  ok(
    await w.dm({
      type: 'CreateEntity',
      entityId: 'r1-charm',
      kind: 'item',
      name: 'Charm',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  ok(await startAmbush(w));
  ok(
    await w.dm({
      type: 'AddClue',
      entityId: 'r1-charm',
      method: 'magic',
      statement: 'R1_OFF_GRID',
      subjects: [],
    }),
  );
  ok(await w.submit(cast(ELOWEN, 'detect-magic')));
  assert.ok(!JSON.stringify([...(await w.state()).knowledge.values()]).includes('R1_OFF_GRID'));
  ok(await w.dm({ type: 'EndCombat', encounterId: (await w.encounter()).encounterId }));
  ok(await w.submit(cast(ELOWEN, 'detect-magic')));
  assert.ok(JSON.stringify([...(await w.state()).knowledge.values()]).includes('R1_OFF_GRID'));
  results.H03NoSquare = { inCombat: false, afterCombat: true, ...(await audit(w)) };
}
// Adjacent stat-block authoring after combat.
{
  const w = await roadWorld();
  ok(await startAmbush(w));
  const ended = ok(
    await w.dm({ type: 'EndCombat', encounterId: (await w.encounter()).encounterId }),
  );
  const block = (await w.state()).statBlocks.get(SHAMAN);
  const edit = ok(
    await w.dm({ type: 'SetStatBlock', entityId: SHAMAN, statBlock: { ...block, armorClass: 14 } }),
  );
  const refused = await unsafe(w, ended, edit);
  ok(await undo(w, edit));
  ok(await undo(w, ended));
  results.AdjacentStatBlock = { ...refused, ...(await audit(w)) };
}
// Adjacent negative examination and Detect Magic premises.
for (const method of ['inspect', 'magic']) {
  const w = await roadWorld();
  const here = (await w.state()).entities.get(ELOWEN).placement.locationId;
  ok(
    await w.dm({
      type: 'CreateEntity',
      entityId: 'r1-item',
      kind: 'item',
      name: 'Item',
      existsSince: null,
      placement: { locationId: here, since: null },
    }),
  );
  ok(
    await w.dm({
      type: 'AddClue',
      entityId: 'r1-item',
      method,
      statement: 'R1_REPEAT',
      subjects: [],
    }),
  );
  const command =
    method === 'magic'
      ? cast(ELOWEN, 'detect-magic')
      : { type: 'ExamineEntity', characterId: ELOWEN, entityId: 'r1-item', method };
  const first = ok(await w.submit(command));
  const second = ok(await w.submit(command));
  assert.deepEqual(second.outcome.discovered, []);
  const refused = await unsafe(w, first, second);
  ok(await undo(w, second));
  ok(await undo(w, first));
  results[`AdjacentRepeat-${method}`] = { ...refused, ...(await audit(w)) };
}
// New H04: caster outside the active encounter loses target premises.
// No-encounter controls must reject the same undo; with an unrelated fight,
// this revision incorrectly accepts it. These are vulnerability assertions.
for (const fight of [false, true])
  for (const variant of ['status', 'existence', 'placement']) {
    const w = await roadWorld();
    if (fight)
      ok(
        await startAmbush(w, undefined, (c) => ({
          ...c,
          combatants: c.combatants.filter((x) => x.entityId !== ELOWEN),
        })),
      );
    const here = (await w.state()).entities.get(ELOWEN).placement.locationId;
    const created = ok(
      await w.dm({
        type: 'CreateEntity',
        entityId: 'r1-bystander',
        kind: 'npc',
        name: 'Bystander',
        existsSince: null,
        ...(variant === 'placement' ? {} : { placement: { locationId: here, since: null } }),
      }),
    );
    let premise = created;
    if (variant === 'status') {
      ok(await w.dm({ type: 'ChangeEntityStatus', entityId: 'r1-bystander', status: 'dead' }));
      premise = ok(
        await w.dm({ type: 'ChangeEntityStatus', entityId: 'r1-bystander', status: 'active' }),
      );
    }
    if (variant === 'placement')
      premise = ok(await w.dm({ type: 'PlaceEntity', entityId: 'r1-bystander', locationId: here }));
    const marked = ok(await w.submit(cast(ELOWEN, 'hunters-mark', { targetId: 'r1-bystander' })));
    const undone = await undo(w, premise);
    if (fight) assert.equal(undone.status, 'accepted');
    else assert.equal(undone.code, 'UNDO_UNSAFE');
    const s = await w.state();
    results[`H04-${fight ? 'unrelated-fight' : 'no-fight'}-${variant}`] = {
      premise: premise.commandId,
      cast: marked.commandId,
      undo: undone.commandId,
      result: undone.code ?? undone.status,
      targetExists: s.entities.has('r1-bystander'),
      targetStatus: s.entities.get('r1-bystander')?.status ?? null,
      targetPlacement: s.entities.get('r1-bystander')?.placement ?? null,
      concentration: s.characterSheets.get(ELOWEN).concentration,
      ...(await audit(w, fight)),
    };
  }
await mkdir('reviews/evidence/gate-03/retest-1', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-1/state-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      cases: Object.keys(results).length,
      newFailures: Object.entries(results)
        .filter(([k, v]) => k.startsWith('H04-unrelated'))
        .map(([caseName, value]) => ({ caseName, ...value })),
    },
    null,
    2,
  ),
);
```
