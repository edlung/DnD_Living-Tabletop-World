# Gate 03 — State probes

Uses independent in-memory worlds and scripted dice. Writes `state-results.json`.

Run from the repository root with installed dependencies and Node supporting TypeScript stripping:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/STATE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

These assertions establish the **actual vulnerable behavior** of revision `429e2a2`; success reproduces the findings, not a passing gate. After remediation, replace the vulnerable expectations with the report's required safe outcomes. No application source or tests are modified. Scripted timestamps are fixture data, not the review date.

```javascript
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {
  CAMPAIGN,
  ELOWEN,
  SHAMAN,
  openWindowId,
  roadWorld,
  startAmbush,
} from './packages/combat/src/testing/road.ts';
import {
  SEREN,
  addSeren,
  cast,
  closeWindow,
  counterspell,
  ignore,
  shamanCastsAtElowen,
  withSeren,
} from './packages/combat/src/testing/reactions.ts';
import { checkWorldIntegrity, redecideEffective, replay } from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';

const results = {};
const accepted = (result) => {
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  return result;
};
const undo = (world, result) =>
  world.dm({ type: 'UndoCommand', targetCommandId: result.commandId });
async function audit(world) {
  const state = await world.state();
  const history = (await world.store.loadStream(CAMPAIGN)).events;
  assert.deepEqual(replay(history), state);
  return {
    replayEqual: true,
    integrity: checkWorldIntegrity(state),
    redecision: redecideEffective(
      await world.engine.commandLog(CAMPAIGN),
      { state, history },
      () => 0,
      createCombatEngine(),
    ),
  };
}

// H01: undo a counter that closed a window after an otherwise legal DM edit.
{
  const world = await roadWorld();
  accepted(await startAmbush(world));
  const { windowId } = await shamanCastsAtElowen(world);
  world.roll(20, 1);
  const answer = accepted(await world.submit(counterspell(ELOWEN, windowId)));
  const edit = accepted(
    await world.dm({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' }),
  );
  const undone = accepted(await undo(world, answer));
  assert.equal((await world.state()).reactionWindows.get(windowId).status, 'open');
  const before = (await world.state()).version;
  let failure;
  try {
    await world.submit(ignore(ELOWEN, windowId));
  } catch (error) {
    failure = error.message;
  }
  assert.match(failure, /became illegal \(ACTOR_DEAD\)/);
  assert.equal((await world.state()).version, before);
  results.undoReopensInvalidWindow = {
    windowId,
    answer: answer.commandId,
    edit: edit.commandId,
    undo: undone.commandId,
    failure,
    atomic: true,
    ...(await audit(world)),
  };
}

// Adjacent H01: the same boundary fails for a character caster's conditions.
{
  const world = await roadWorld();
  await addSeren(world);
  accepted(await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren()));
  accepted(await world.submit(cast(ELOWEN, 'detect-magic')));
  const windowId = await openWindowId(world);
  world.roll(20, 1);
  const answer = accepted(await world.dm(counterspell(SEREN, windowId)));
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  const edit = accepted(
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['incapacitated'] },
    }),
  );
  accepted(await undo(world, answer));
  let failure;
  try {
    await world.dm(closeWindow(windowId));
  } catch (error) {
    failure = error.message;
  }
  assert.match(failure, /became illegal \(INCAPACITATED\)/);
  results.undoReopensIncapacitatedCaster = { windowId, failure, ...(await audit(world)) };
  accepted(await undo(world, edit));
  accepted(await world.dm(closeWindow(windowId)));
  assert.equal((await audit(world)).redecision, null);
}

// H02: a missed attack must depend on the target's defense, not only the attacker.
{
  const world = await roadWorld();
  await addSeren(world);
  accepted(await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren()));
  const sheet = (await world.state()).characterSheets.get(SEREN);
  const edit = accepted(
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: SEREN,
      sheet: { ...sheet, armorClass: 30 },
    }),
  );
  world.roll(20, 10);
  const attack = accepted(
    await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: SEREN,
    }),
  );
  assert.equal(attack.outcome.hit, false);
  const undone = accepted(await undo(world, edit));
  const state = await world.state();
  const checked = await audit(world);
  assert.notEqual(checked.redecision, null);
  results.undoTargetDefense = {
    edit: edit.commandId,
    attack: attack.commandId,
    undo: undone.commandId,
    outcome: attack.outcome,
    restoredArmorClass: state.characterSheets.get(SEREN).armorClass,
    ...checked,
  };
}

// H03 boundary controls, without a reaction candidate: 30 ft is permitted,
// 35 ft and 50 ft must not disclose, but all three disclose on this revision.
for (const distanceFt of [30, 35, 50]) {
  const world = await roadWorld();
  accepted(
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((entry) =>
        entry.entityId === SHAMAN ? { ...entry, position: { x: 2 + distanceFt / 5, y: 1 } } : entry,
      ),
    })),
  );
  accepted(
    await world.dm({
      type: 'AddClue',
      clueId: 'g03-range-boundary',
      entityId: SHAMAN,
      method: 'magic',
      statement: 'G03_RANGE_BOUNDARY',
      subjects: [SHAMAN],
    }),
  );
  accepted(await world.submit(cast(ELOWEN, 'detect-magic')));
  const disclosed = [...(await world.state()).knowledge.values()].some(
    (entry) => entry.statement === 'G03_RANGE_BOUNDARY',
  );
  assert.equal(disclosed, true);
  results[`detectMagicAt${distanceFt}Ft`] = {
    distanceFt,
    expectedDisclosure: distanceFt <= 30,
    actualDisclosure: disclosed,
  };
}

// H03: 50 ft lies outside Detect Magic's accepted 30-ft combat radius.
for (const suspended of [false, true]) {
  const world = await roadWorld();
  if (suspended) await addSeren(world);
  accepted(
    await startAmbush(
      world,
      suspended ? [17, 3, 2, 1, 15, 5] : undefined,
      suspended ? withSeren() : undefined,
    ),
  );
  accepted(
    await world.dm({
      type: 'AddClue',
      clueId: 'g03-distant-magic',
      entityId: SHAMAN,
      method: 'magic',
      statement: 'G03_DISTANT_MAGIC_SECRET',
      subjects: [SHAMAN],
    }),
  );
  const castResult = accepted(await world.submit(cast(ELOWEN, 'detect-magic')));
  let closeResult;
  if (suspended) {
    const window = [...(await world.state()).reactionWindows.values()].find(
      (w) => w.status === 'open',
    );
    closeResult = accepted(await world.dm(closeWindow(window.windowId)));
  }
  const state = await world.state();
  const found = [...state.knowledge.values()].find(
    (k) => k.statement === 'G03_DISTANT_MAGIC_SECRET',
  );
  assert.ok(found);
  results[suspended ? 'suspendedDetectMagicRange' : 'directDetectMagicRange'] = {
    casterPosition: state.encounter.combatants.find((c) => c.entityId === ELOWEN).position,
    targetPosition: state.encounter.combatants.find((c) => c.entityId === SHAMAN).position,
    cast: castResult.commandId,
    close: closeResult?.commandId,
    discovery: found,
    ...(await audit(world)),
  };
}

await writeFile(
  'reviews/evidence/gate-03/state-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
```
