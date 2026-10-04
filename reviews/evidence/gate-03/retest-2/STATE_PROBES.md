# Independent state retest

54 cases. Checks G03-H01–H04 and adjacent negative premises, with replay, structural/window checks and effective-command re-decision. No database required.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-2/STATE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

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
    const marker = `R2_MAGIC_${mode}_${distance}`;
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
      entityId: 'r2-charm',
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
      entityId: 'r2-charm',
      method: 'magic',
      statement: 'R2_OFF_GRID',
      subjects: [],
    }),
  );
  ok(await w.submit(cast(ELOWEN, 'detect-magic')));
  assert.ok(!JSON.stringify([...(await w.state()).knowledge.values()]).includes('R2_OFF_GRID'));
  ok(await w.dm({ type: 'EndCombat', encounterId: (await w.encounter()).encounterId }));
  ok(await w.submit(cast(ELOWEN, 'detect-magic')));
  assert.ok(JSON.stringify([...(await w.state()).knowledge.values()]).includes('R2_OFF_GRID'));
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
      entityId: 'r2-item',
      kind: 'item',
      name: 'Item',
      existsSince: null,
      placement: { locationId: here, since: null },
    }),
  );
  ok(
    await w.dm({
      type: 'AddClue',
      entityId: 'r2-item',
      method,
      statement: 'R2_REPEAT',
      subjects: [],
    }),
  );
  const command =
    method === 'magic'
      ? cast(ELOWEN, 'detect-magic')
      : { type: 'ExamineEntity', characterId: ELOWEN, entityId: 'r2-item', method };
  const first = ok(await w.submit(command));
  const second = ok(await w.submit(command));
  assert.deepEqual(second.outcome.discovered, []);
  const refused = await unsafe(w, first, second);
  ok(await undo(w, second));
  ok(await undo(w, first));
  results[`AdjacentRepeat-${method}`] = { ...refused, ...(await audit(w)) };
}
// H04: actual target premises and caster placement survive an unrelated encounter.
for (const fight of [false, true])
  for (const spell of ['hunters-mark', 'healing-word'])
    for (const variant of ['status', 'existence', 'placement', 'caster-placement']) {
      const w = await roadWorld();
      if (fight)
        ok(
          await startAmbush(w, [3, 2, 1, 15], (c) => ({
            ...c,
            combatants: c.combatants.filter((x) => x.entityId !== ELOWEN),
          })),
        );
      const here = (await w.state()).entities.get(ELOWEN).placement.locationId;
      const there = variant === 'caster-placement' ? 'golden-stag-inn' : here;
      const created = ok(
        await w.dm({
          type: 'CreateEntity',
          entityId: 'r2-bystander',
          kind: 'npc',
          name: 'Bystander',
          existsSince: null,
          ...(variant === 'placement' ? {} : { placement: { locationId: there, since: null } }),
        }),
      );
      let premise = created;
      if (variant === 'status') {
        ok(await w.dm({ type: 'ChangeEntityStatus', entityId: 'r2-bystander', status: 'dead' }));
        premise = ok(
          await w.dm({ type: 'ChangeEntityStatus', entityId: 'r2-bystander', status: 'active' }),
        );
      }
      if (variant === 'placement')
        premise = ok(
          await w.dm({ type: 'PlaceEntity', entityId: 'r2-bystander', locationId: there }),
        );
      if (variant === 'caster-placement')
        premise = ok(
          await w.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: there }),
        );
      const spellCast = ok(await w.submit(cast(ELOWEN, spell, { targetId: 'r2-bystander' })));
      const refusal = await unsafe(w, premise, spellCast);
      await audit(w);
      ok(await undo(w, spellCast));
      ok(await undo(w, premise));
      results[`H04-${fight ? 'unrelated-fight' : 'no-fight'}-${spell}-${variant}`] = {
        premise: premise.commandId,
        cast: spellCast.commandId,
        ...refusal,
        recovery: 'accepted',
        ...(await audit(w)),
      };
    }
// Healing with actual HP and a stat block, plus a full-health no-change control.
for (const fight of [false, true])
  for (const damaged of [false, true]) {
    const w = await roadWorld();

    const here = (await w.state()).entities.get(ELOWEN).placement.locationId;
    const target = 'goblin-raider-2';
    const original = (await w.state()).statBlocks.get(target);
    const block = {
      ...original,
      hitPoints: { ...original.hitPoints, current: damaged ? 1 : original.hitPoints.max },
    };
    ok(await w.dm({ type: 'SetStatBlock', entityId: target, statBlock: block }));
    if (fight)
      ok(
        await startAmbush(w, [3, 2, 1, 15], (c) => ({
          ...c,
          combatants: c.combatants.filter((x) => x.entityId !== ELOWEN),
        })),
      );
    if (!fight) ok(await w.dm({ type: 'PlaceEntity', entityId: target, locationId: here }));
    ok(await w.dm({ type: 'ChangeEntityStatus', entityId: target, status: 'dead' }));
    const premise = ok(
      await w.dm({ type: 'ChangeEntityStatus', entityId: target, status: 'active' }),
    );

    const before = (await w.state()).statBlocks.get(target).hitPoints.current;
    const healed = ok(await w.submit(cast(ELOWEN, 'healing-word', { targetId: target })));
    const after = (await w.state()).statBlocks.get(target).hitPoints.current;
    assert.equal(after > before, damaged);
    const refusal = await unsafe(w, premise, healed);
    await audit(w);
    ok(await undo(w, healed));
    ok(await undo(w, premise));
    results[
      `H04-real-healing-${fight ? 'unrelated-fight' : 'no-fight'}-${damaged ? 'injured' : 'full'}`
    ] = { hpBefore: before, hpAfter: after, ...refusal, recovery: 'accepted', ...(await audit(w)) };
  }
// Caster-in-combat controls preserve target status dependencies for both spells.
for (const spell of ['hunters-mark', 'healing-word']) {
  const w = await roadWorld();
  ok(await startAmbush(w));
  const target = 'goblin-raider-2';
  ok(await w.dm({ type: 'ChangeEntityStatus', entityId: target, status: 'dead' }));
  const premise = ok(
    await w.dm({ type: 'ChangeEntityStatus', entityId: target, status: 'active' }),
  );
  const spellCast = ok(await w.submit(cast(ELOWEN, spell, { targetId: target })));
  const refusal = await unsafe(w, premise, spellCast);
  await audit(w);
  ok(await undo(w, spellCast));
  ok(await undo(w, premise));
  results[`H04-own-fight-${spell}`] = { ...refusal, ...(await audit(w)) };
}
// Compare complete command outcome and spell premises between equivalent worlds.
for (const spell of ['hunters-mark', 'healing-word', 'detect-magic']) {
  const outcomes = [];
  for (const fight of [false, true]) {
    const w = await roadWorld();
    if (fight)
      ok(
        await startAmbush(w, [3, 2, 1, 15], (c) => ({
          ...c,
          combatants: c.combatants.filter((x) => x.entityId !== ELOWEN),
        })),
      );
    else {
      const { AMBUSH } = await import('./packages/combat/src/testing/road.ts');
      for (const command of AMBUSH.place) ok(await w.dm(command));
    }
    ok(
      await w.dm({
        type: 'CreateEntity',
        entityId: 'r2-bystander',
        kind: 'npc',
        name: 'Bystander',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      }),
    );
    for (const entityId of [SHAMAN, 'r2-bystander'])
      ok(
        await w.dm({
          type: 'AddClue',
          entityId,
          clueId: `magic-${entityId}`,
          method: 'magic',
          statement: `R2_MAGIC_${entityId}`,
          subjects: [],
        }),
      );
    const result = ok(
      await w.submit(
        cast(ELOWEN, spell, spell === 'detect-magic' ? {} : { targetId: 'r2-bystander' }),
      ),
    );
    const events = (await w.engine.load(CAMPAIGN)).history.filter(
      (e) => e.causation.commandId === result.commandId,
    );
    const premises = events.flatMap((e) =>
      e.type === 'PremisesRecorded' ? e.payload.premises : [],
    );
    const revealed = events.flatMap((e) =>
      e.type === 'EvidenceExamined' ? e.payload.revealed.map((x) => x.clueId) : [],
    );
    // Discovery outcome contains generated record IDs. Compare all non-ID outcome fields,
    // plus revealed clue IDs and the canonical knowledge claims, separately.
    const outcome = { ...result.outcome };
    delete outcome.discovered;
    outcomes.push({
      outcome,
      discoveredCount: result.outcome.discovered?.length ?? 0,
      premises,
      revealed,
    });
    await audit(w);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  if (spell === 'detect-magic') assert.ok(outcomes[0].revealed.includes(`magic-${SHAMAN}`));
  results[`H04-isolation-${spell}`] = { equivalent: true, ...outcomes[0] };
}
// The newly recorded out-of-reach clue protects both clue creation and placement.
for (const mode of ['another-location', 'combat-radius', 'combat-gridless']) {
  const w = await roadWorld();
  if (mode !== 'another-location') ok(await startAmbush(w));
  const target = mode === 'combat-radius' ? SHAMAN : 'r2-far-charm';
  if (mode !== 'combat-radius')
    ok(
      await w.dm({
        type: 'CreateEntity',
        entityId: target,
        kind: 'item',
        name: 'Far charm',
        existsSince: null,
        placement: {
          locationId: mode === 'another-location' ? 'north-gate' : 'old-trade-road',
          since: null,
        },
      }),
    );
  const clue = ok(
    await w.dm({
      type: 'AddClue',
      entityId: target,
      clueId: `unreached-${mode}`,
      method: 'magic',
      statement: 'R2_UNREACHED',
      subjects: [],
    }),
  );
  const detected = ok(await w.submit(cast(ELOWEN, 'detect-magic')));
  assert.deepEqual(detected.outcome.discovered, []);
  const refusal = await unsafe(w, clue, detected);
  await audit(w);
  ok(await undo(w, detected));
  ok(await undo(w, clue));
  results[`AdjacentUnreached-${mode}`] = { ...refusal, recovery: 'accepted', ...(await audit(w)) };
}
await mkdir('reviews/evidence/gate-03/retest-2', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-2/state-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify({ cases: Object.keys(results).length, allAssertionsPassed: true }));
```
