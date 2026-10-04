# Outside-caster and hidden-window boundaries

27 comparisons across 66 independent worlds. Covers full/injured targets, combatant/self/non-combatant targets, Detect Magic, absent/incapacitated precedence, complete context equality and eleven other player-command probes. Checks unchanged protected fight state, replay and effective-command re-decision. Uses deterministic in-memory worlds.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-4/BOUNDARY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  roadWorld,
  startAmbush,
  AMBUSH,
  CAMPAIGN,
  ELOWEN,
  SHAMAN,
  PLAYER,
  ScriptedEntropy,
} from './packages/combat/src/testing/road.ts';
import { addSeren, SEREN, withSeren, cast } from './packages/combat/src/testing/reactions.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  replay,
  checkWorldIntegrity,
  redecideEffective,
  openReactionWindow,
} from './packages/domain/src/index.ts';
import { skillCheckPort } from './packages/rules/src/skill-check-port.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { reactionWindowViolations } from './packages/combat/src/reactions/invariants.ts';
import { entityContext } from './packages/context/src/entity-context.ts';
import { elowenView } from './packages/context/src/testing/ravenford.ts';
const results = {};
const ok = (r) => {
  assert.equal(r.status, 'accepted', JSON.stringify(r));
  return r;
};
const seen = (r) =>
  r.status === 'rejected'
    ? { status: r.status, code: r.code, message: r.message }
    : { status: r.status, outcome: r.outcome };
const protectedState = (s) => ({
  clock: s.clock,
  encounter: s.encounter,
  windows: [...s.reactionWindows],
  combatants: s.encounter?.combatants.map((c) => ({
    entity: s.entities.get(c.entityId),
    sheet: s.characterSheets.get(c.entityId),
    block: s.statBlocks.get(c.entityId),
  })),
});
async function arranged(phase, injured = false, restriction = null) {
  const w = await roadWorld();
  await addSeren(w);
  const sheet = (await w.state()).characterSheets.get(ELOWEN);
  ok(
    await w.dm({
      type: 'CreateEntity',
      entityId: 'r4-patient',
      kind: 'npc',
      name: 'Patient',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  const block = (await w.state()).statBlocks.get(SHAMAN);
  const wounded = {
    ...block,
    hitPoints: { ...block.hitPoints, current: injured ? 9 : block.hitPoints.max },
  };
  ok(await w.dm({ type: 'SetStatBlock', entityId: 'r4-patient', statBlock: wounded }));
  ok(await w.dm({ type: 'SetStatBlock', entityId: SHAMAN, statBlock: wounded }));
  ok(
    await w.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        hitPoints: { ...sheet.hitPoints, current: injured ? 40 : sheet.hitPoints.max },
        ...(restriction === 'incapacitated' ? { conditions: ['incapacitated'] } : {}),
      },
    }),
  );
  if (phase === 'none') for (const c of AMBUSH.place) ok(await w.dm(c));
  else
    ok(
      await startAmbush(w, [3, 2, 1, 15, 5], (c) =>
        withSeren()({ ...c, combatants: c.combatants.filter((x) => x.entityId !== ELOWEN) }),
      ),
    );
  if (restriction === 'absent')
    ok(await w.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' }));
  if (phase === 'open') ok(await w.dm(cast(SHAMAN, 'ashen-bolt', { targetId: SEREN })));
  const checks = skillCheckPort({ roll: () => 11 });
  const engine = new WorldEngine({
    store: w.store,
    ids: new SequentialIds(300),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: new ScriptedEntropy(),
    checks,
  });
  return {
    engine,
    checks,
    state: async () => (await engine.load(CAMPAIGN)).state,
    submit: (c) =>
      engine.execute({ campaignId: CAMPAIGN, commandId: 'r4-probe', actor: PLAYER, command: c }),
  };
}
async function audited(w, before, phase) {
  const snap = await w.engine.load(CAMPAIGN);
  assert.deepEqual(replay(snap.history), snap.state);
  assert.deepEqual(checkWorldIntegrity(snap.state), []);
  assert.deepEqual(reactionWindowViolations(snap.state), []);
  assert.equal(
    redecideEffective(
      await w.engine.commandLog(CAMPAIGN),
      snap,
      w.checks.skillModifier.bind(w.checks),
      createCombatEngine(),
    ),
    null,
  );
  if (phase === 'open') assert.deepEqual(protectedState(snap.state), protectedState(before));
}
const probes = [
  ['healing-word', SHAMAN],
  ['hunters-mark', SHAMAN],
  ['healing-word', ELOWEN],
  ['healing-word', 'r4-patient'],
  ['hunters-mark', 'r4-patient'],
  ['detect-magic', null],
];
for (const injured of [false, true])
  for (const [spell, target] of probes) {
    const observations = {};
    for (const phase of ['none', 'fight', 'open']) {
      const w = await arranged(phase, injured);
      const before = await w.state();
      const context = entityContext(before, elowenView(before), target ?? 'old-trade-road');
      const response = await w.submit(cast(ELOWEN, spell, target ? { targetId: target } : {}));
      assert.notEqual(response.code, 'REACTION_PENDING');
      if (target === SHAMAN && phase !== 'none') {
        assert.equal(response.code, 'ILLEGAL_ACTION');
        assert.equal(response.message, 'TARGET_IN_COMBAT');
        assert.deepEqual(await w.state(), before);
      } else ok(response);
      await audited(w, before, phase);
      observations[phase] = { response: seen(response), context };
    }
    assert.deepEqual(observations.fight, observations.open);
    if (target !== SHAMAN) assert.deepEqual(observations.none, observations.fight);
    results[`H06-${injured ? 'injured' : 'full'}-${spell}-${target ?? 'room'}`] = {
      phases: 3,
      windowHidden: true,
      pausePreserved: true,
      responses: Object.fromEntries(Object.entries(observations).map(([k, v]) => [k, v.response])),
      contextEqualAcrossWindow: true,
    };
  }
for (const restriction of ['absent', 'incapacitated'])
  for (const spell of ['healing-word', 'hunters-mark']) {
    const observations = [];
    for (const phase of ['fight', 'open']) {
      const w = await arranged(phase, false, restriction);
      const before = await w.state();
      const response = await w.submit(cast(ELOWEN, spell, { targetId: SHAMAN }));
      assert.equal(response.status, 'rejected');
      assert.notEqual(response.message, 'TARGET_IN_COMBAT');
      assert.notEqual(response.code, 'REACTION_PENDING');
      assert.deepEqual(await w.state(), before);
      observations.push({
        response: seen(response),
        context: entityContext(before, elowenView(before), SHAMAN),
      });
      await audited(w, before, phase);
    }
    assert.deepEqual(observations[0], observations[1]);
    results[`H06-precedence-${restriction}-${spell}`] = { windowHidden: true, ...observations[0] };
  }
const commands = [
  { type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' },
  { type: 'ExamineEntity', characterId: ELOWEN, entityId: SHAMAN, method: 'inspect' },
  { type: 'ExamineEntity', characterId: ELOWEN, entityId: SHAMAN, method: 'investigation' },
  { type: 'ExamineEntity', characterId: ELOWEN, entityId: SHAMAN, method: 'perception' },
  { type: 'AskAbout', characterId: ELOWEN, npcId: 'r4-patient', topicId: ELOWEN },
  {
    type: 'FormHypothesis',
    characterId: ELOWEN,
    scope: 'PARTY',
    statement: 'The road may be unsafe.',
    subjects: [SHAMAN],
  },
  { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 1, y: 1 }] },
  { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: SHAMAN },
  { type: 'EndTurn', combatantId: ELOWEN },
  { type: 'UseReaction', combatantId: ELOWEN, windowId: 'placeholder', reaction: 'counterspell' },
  { type: 'DeclineReaction', combatantId: ELOWEN, windowId: 'placeholder' },
];
for (const [index, command] of commands.entries()) {
  const observations = [];
  for (const phase of ['fight', 'open']) {
    const w = await arranged(phase);
    const before = await w.state();
    const c = { ...command };
    if ('windowId' in c) c.windowId = openReactionWindow(before)?.windowId ?? 'unknown-window';
    const response = await w.submit(c);
    assert.notEqual(response.code, 'REACTION_PENDING');
    if (response.status === 'rejected') assert.deepEqual(await w.state(), before);
    await audited(w, before, phase);
    observations.push(seen(response));
  }
  assert.deepEqual(observations[0], observations[1]);
  results[`H06-other-${index}-${command.type}`] = {
    windowHidden: true,
    pausePreserved: true,
    response: observations[0],
  };
}
await mkdir('reviews/evidence/gate-03/retest-4', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-4/boundary-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    comparisons: Object.keys(results).length,
    worlds: 36 + 8 + 22,
    allAssertionsPassed: true,
  }),
);
```
