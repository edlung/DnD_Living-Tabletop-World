import { commandSubmissionSchema, submissionsFromScript, type WorldEngine } from '@ltw/domain';

import combatSeed from '../../../../fixtures/ravenford/combat-seed.json' with { type: 'json' };
import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import campaigns from '../../../../tests/e2e/fixtures/combat-campaigns.json' with { type: 'json' };
import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/** How far the scripted Old Trade Road ambush is played before the browser takes over. */
export type CombatStage = 'placed' | 'started' | 'window';

/**
 * Every mutating combat journey owns a campaign cloned from the authorized
 * Ravenford script and advanced only through real DM commands (initiative is
 * Elowen, three Raiders, then the Shaman, as in reaction-routes.test.ts).
 * `window` pauses at a genuine open Counterspell window.
 */
export async function seedCombatCampaign(
  engine: WorldEngine,
  campaignId: string,
  stage: CombatStage,
  /** The Ravenford fixtures to seed from; the Russian ones for a Russian campaign (ADR 0031). */
  fixturesDir?: string,
): Promise<void> {
  for (const input of (await loadRavenfordSeed(fixturesDir)).submissions) {
    const submission = commandSubmissionSchema.parse(input);
    await accept(engine, {
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
  }
  const script = [
    ...ambush.place,
    ...(stage === 'placed' ? [] : [ambush.startCombat]),
    ...(stage === 'window'
      ? [
          ...[
            'elowen-starwhisper',
            'creature-10fb59d4',
            'creature-589f6668',
            'creature-6513bec0',
          ].map((combatantId) => ({ type: 'EndTurn', combatantId })),
          {
            type: 'CastSpell',
            combatantId: 'creature-ae08be99',
            spellId: 'ashen-bolt',
            targetId: 'elowen-starwhisper',
          },
        ]
      : []),
  ];
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.ambush`,
    commands: script,
  })) {
    await accept(engine, submission);
  }
}

const STAGES: Readonly<Record<keyof typeof campaigns, CombatStage>> = {
  turn: 'started',
  area: 'started',
  preview: 'started',
  counter: 'window',
  ignore: 'window',
  expire: 'window',
  stale: 'window',
  lifecycle: 'placed',
  sessionTurn: 'started',
  sessionWindow: 'window',
  // Started below, once Elowen lies prone.
  board: 'placed',
  narrow: 'started',
  // Started below with Raider 1 beside Elowen (ADR 0046).
  opportunity: 'placed',
  readied: 'placed',
  opportunityRu: 'placed',
  shield: 'placed',
  // The weapons' journeys (docs/adr/0047-weapons.md): Raider 1 beside Elowen.
  weapons: 'placed',
  offhand: 'placed',
  grapple: 'placed',
  // The hit points' journey (docs/adr/0048-hit-points.md): beside her, and a cart on the road.
  hitPoints: 'placed',
  // Space (docs/adr/0049-space-and-movement.md): a Large raider, a wall with a gap.
  space: 'placed',
  // Terrain and flight (ADR 0049 §5–8): a ledge, a stream and a pit; Elowen with wings.
  terrain: 'placed',
  flight: 'placed',
  // Feather Fall (ADR 0049 §8): Elowen knows it, a pit 20 ft deep beside her.
  featherFall: 'placed',
};

export async function seedUiCombatCampaigns(engine: WorldEngine): Promise<void> {
  for (const [name, campaignId] of Object.entries(campaigns)) {
    // A name ending in Ru is a Russian campaign (ADR 0031).
    const fixtures = name.endsWith('Ru') ? RAVENFORD_RU_FIXTURES_DIR : undefined;
    await seedCombatCampaign(engine, campaignId, STAGES[name as keyof typeof campaigns], fixtures);
  }
  await seedProneStart(engine, campaigns.board);
  await seedBesideStart(engine, campaigns.opportunity);
  await seedBesideStart(engine, campaigns.readied);
  await seedBesideStart(engine, campaigns.opportunityRu);
  await seedBesideStart(engine, campaigns.shield);
  await seedBesideStart(engine, campaigns.weapons);
  await seedBesideStart(engine, campaigns.offhand);
  await seedBesideStart(engine, campaigns.grapple);
  await seedCart(engine, campaigns.hitPoints);
  await seedBesideStart(engine, campaigns.hitPoints);
  await seedSpaceStart(engine, campaigns.space);
  await seedTerrainStart(engine, campaigns.terrain, false);
  await seedTerrainStart(engine, campaigns.flight, true);
  await seedFeatherFallStart(engine, campaigns.featherFall);
}

/**
 * The terrain journeys (`terrain.spec.ts`, docs/adr/0049-space-and-movement.md §5–8): a stream at
 * (3, 7)–(4, 7) and a pit 10 ft deep at (5, 6). In the terrain campaign Elowen starts on a ledge
 * 10 ft high, (2, 5)–(2, 6), above level ground; in the flight one she stands on level ground with
 * a Fly Speed of 30 ft.
 */
async function seedTerrainStart(
  engine: WorldEngine,
  campaignId: string,
  flies: boolean,
): Promise<void> {
  const sheet = rulesSeed.commands.find(
    (command) => command.type === 'SetCharacterSheet' && command.entityId === 'elowen-starwhisper',
  );
  if (!sheet || !('sheet' in sheet)) throw new Error('UI combat: Elowen has no sheet to seed');
  const ledge = flies ? [] : [5, 6].map((y) => ({ x: 2, y, ft: 10 }));
  const start = {
    ...ambush.startCombat,
    battlefield: {
      ...ambush.startCombat.battlefield,
      water: [3, 4].map((x) => ({ x, y: 7 })),
      ground: [...ledge, { x: 5, y: 6, ft: -10 }],
    },
  };
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.terrain`,
    commands: [
      ...(flies ? [{ ...sheet, sheet: { ...sheet.sheet, speeds: { fly: 30 } } }] : []),
      start,
    ],
  })) {
    await accept(engine, submission);
  }
}

/**
 * The space journey (`space.spec.ts`, docs/adr/0049-space-and-movement.md): Raider 1 made Large at
 * (6, 5), filling four squares, and a wall along x = 4 with a gap at (4, 6), in front of Elowen.
 */
async function seedSpaceStart(engine: WorldEngine, campaignId: string): Promise<void> {
  const raider = combatSeed.commands.find(
    (command) => command.type === 'SetStatBlock' && command.entityId === 'creature-10fb59d4',
  );
  if (!raider || !('statBlock' in raider)) throw new Error('UI combat: Raider 1 has no stat block');
  const start = {
    ...ambush.startCombat,
    battlefield: {
      ...ambush.startCombat.battlefield,
      walls: [3, 4, 5, 7, 8].map((y) => ({ x: 4, y })),
    },
    combatants: ambush.startCombat.combatants.map((combatant) =>
      combatant.entityId === 'creature-10fb59d4'
        ? { ...combatant, position: { x: 6, y: 5 } }
        : combatant,
    ),
  };
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.space`,
    commands: [{ ...raider, statBlock: { ...raider.statBlock, size: 'large' } }, start],
  })) {
    await accept(engine, submission);
  }
}

/**
 * The Feather Fall journey (`terrain.spec.ts`, docs/adr/0049-space-and-movement.md §8): Elowen knows
 * the spell, and a pit 20 ft deep lies beside her at (3, 6).
 */
async function seedFeatherFallStart(engine: WorldEngine, campaignId: string): Promise<void> {
  const sheet = rulesSeed.commands.find(
    (command) => command.type === 'SetCharacterSheet' && command.entityId === 'elowen-starwhisper',
  );
  if (!sheet || !('sheet' in sheet)) throw new Error('UI combat: Elowen has no sheet to seed');
  const spellcasting = sheet.sheet.spellcasting.map((source, index) =>
    index === 0 ? { ...source, spells: [...source.spells, 'feather-fall'] } : source,
  );
  const start = {
    ...ambush.startCombat,
    battlefield: { ...ambush.startCombat.battlefield, ground: [{ x: 3, y: 6, ft: -20 }] },
  };
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.feather`,
    commands: [{ ...sheet, sheet: { ...sheet.sheet, spellcasting } }, start],
  })) {
    await accept(engine, submission);
  }
}

/** An overturned cart on the Old Trade Road, for the DM to bring into the fight as an object. */
async function seedCart(engine: WorldEngine, campaignId: string): Promise<void> {
  const cart = 'feature-a022d4a2';
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.cart`,
    commands: [
      {
        type: 'CreateEntity',
        entityId: cart,
        kind: 'feature',
        name: 'Overturned cart',
        existsSince: null,
      },
      { type: 'PlaceEntity', entityId: cart, locationId: ambush.startCombat.locationId },
    ],
  })) {
    await accept(engine, submission);
  }
}

/**
 * The opportunity attack journeys (`opportunity.spec.ts`): the ambush starts with Raider 1 one
 * square east of Elowen, at (3,6), so either leaving the other's reach provokes (ADR 0046 §2).
 */
async function seedBesideStart(engine: WorldEngine, campaignId: string): Promise<void> {
  const start = {
    ...ambush.startCombat,
    combatants: ambush.startCombat.combatants.map((combatant) =>
      combatant.entityId === 'creature-10fb59d4'
        ? { ...combatant, position: { x: 3, y: 6 } }
        : combatant,
    ),
  };
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.beside`,
    commands: [start],
  })) {
    await accept(engine, submission);
  }
}

/**
 * The pointer journey's fight (`combat-board-pointer.spec.ts`): Elowen starts it prone, through
 * a real DM sheet command, so her figure carries a condition pip to point at.
 */
async function seedProneStart(engine: WorldEngine, campaignId: string): Promise<void> {
  const sheet = rulesSeed.commands.find(
    (command) => command.type === 'SetCharacterSheet' && command.entityId === 'elowen-starwhisper',
  );
  if (!sheet || !('sheet' in sheet)) throw new Error('UI combat: Elowen has no sheet to seed');
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.prone`,
    commands: [{ ...sheet, sheet: { ...sheet.sheet, conditions: ['prone'] } }, ambush.startCombat],
  })) {
    await accept(engine, submission);
  }
}

async function accept(engine: WorldEngine, submission: unknown): Promise<void> {
  const result = await engine.execute(submission);
  if (result.status !== 'accepted') throw new Error('UI combat campaign seed was not accepted');
}
