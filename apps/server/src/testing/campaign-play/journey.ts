import type { CampaignPlayFixture } from './fixture.ts';

/** Actual ordinary commands only. These are scripted player choices, never generated outcomes. */
export async function investigateBell(f: CampaignPlayFixture) {
  const inspected = await f.act({
    type: 'ExamineEntity',
    entityId: f.id('copper-dust'),
    method: 'inspect',
  });
  const rumor = await f.act({ type: 'AskAbout', npcId: f.id('arden'), topicId: f.id('iva') });
  await f.act({ type: 'EnterLocation', locationId: f.id('lighthouse') });
  const testimony = await f.act({ type: 'AskAbout', npcId: f.id('iva'), topicId: f.id('sluice') });
  const guarded = await f.act({ type: 'AskAbout', npcId: f.id('iva'), topicId: f.id('iva') }, 422);
  await f.act({ type: 'EnterLocation', locationId: f.id('archive') });
  await f.act({ type: 'ExamineEntity', entityId: f.id('plan-copy'), method: 'inspect' });
  await f.act({ type: 'EnterLocation', locationId: f.id('sluice') });
  const journal = await f.act({
    type: 'ExamineEntity',
    entityId: f.id('sluice-journal'),
    method: 'inspect',
  });
  return { inspected, rumor, testimony, guarded, journal };
}

export async function playPreparedCombat(f: CampaignPlayFixture) {
  // The other prepared seats are still unassigned; the DM deliberately moves them to the encounter.
  for (const key of ['borin', 'darya'])
    await f.dm({ type: 'EnterLocation', characterId: f.id(key), locationId: f.id('sluice') });
  const prepared = f.initialContent.scenario.content.encounters.find(
    (item) => item.key === 'sluice-crab',
  );
  const encounterId = f.initialContent.scenario.identities.encounters['sluice-crab'];
  if (!prepared || !encounterId) throw new Error('TEST_PREPARED_ENCOUNTER');
  f.roll(20, 20, 15, 10, 1);
  const started = await f.dm({
    type: 'StartCombat',
    encounterId,
    locationId: f.id(prepared.location),
    battlefield: prepared.battlefield,
    combatants: prepared.combatants.map((combatant) => ({
      entityId: f.id(combatant.entity),
      side: combatant.side,
      position: combatant.position,
    })),
  });
  const playerEncounter = await f.send('player', 'GET', '/encounter?perspective=PLAYER');
  f.roll(20, 15);
  f.roll(8, 4);
  const arrow = await f.command('player', {
    type: 'Attack',
    combatantId: f.id('alena'),
    attackId: 'longbow',
    targetId: f.id('ice-crab'),
  });
  await f.command('player', {
    type: 'MoveCombatant',
    combatantId: f.id('alena'),
    path: [2, 3, 4, 5, 6].map((x) => ({ x, y: 1 })),
  });
  await f.command('player', { type: 'EndTurn', combatantId: f.id('alena') });
  for (const key of ['borin', 'darya']) await f.dm({ type: 'EndTurn', combatantId: f.id(key) });
  const beforeClaw = await f.snapshot();
  f.roll(20, 15);
  f.roll(6, 3);
  const claw = await f.dm({
    type: 'Attack',
    combatantId: f.id('ice-crab'),
    attackId: 'claw',
    targetId: f.id('alena'),
  });
  const afterClaw = await f.snapshot();
  const undone = await f.dm({ type: 'UndoCommand', targetCommandId: claw.commandId });
  const afterUndo = await f.snapshot();
  f.roll(20, 15);
  f.roll(6, 3);
  const replayedClaw = await f.dm({
    type: 'Attack',
    combatantId: f.id('ice-crab'),
    attackId: 'claw',
    targetId: f.id('alena'),
  });
  await f.dm({ type: 'EndTurn', combatantId: f.id('ice-crab') });
  const ended = await f.dm({ type: 'EndCombat', encounterId });
  return {
    encounterId,
    playerEncounter,
    started,
    arrow,
    claw,
    undone,
    replayedClaw,
    ended,
    beforeClaw,
    afterClaw,
    afterUndo,
  };
}
