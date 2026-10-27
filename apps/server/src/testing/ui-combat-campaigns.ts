import { commandSubmissionSchema, submissionsFromScript, type WorldEngine } from '@ltw/domain';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import campaigns from '../../../../tests/e2e/fixtures/combat-campaigns.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

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
};

export async function seedUiCombatCampaigns(engine: WorldEngine): Promise<void> {
  for (const [name, campaignId] of Object.entries(campaigns)) {
    await seedCombatCampaign(engine, campaignId, STAGES[name as keyof typeof campaigns]);
  }
  await seedProneStart(engine, campaigns.board);
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
