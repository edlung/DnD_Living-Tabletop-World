import { randomUUID } from 'node:crypto';

import { commandSubmissionSchema, type EventStore, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import campaigns from '../../../../tests/e2e/fixtures/sign-in-campaigns.json' with { type: 'json' };
import type { CredentialStore } from '../auth/credential-store.ts';
import { iso } from '../auth/session-authenticator.ts';
import { HOUR_MS } from '../auth/sign-in.ts';
import { hashToken } from '../auth/tokens.ts';
import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seededEngine } from './ravenford-app.ts';
import { DM_INVITATIONS_PER_CAMPAIGN, dmInvitationToken } from './ui-sign-in-links.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const ELOWEN = 'elowen-starwhisper';

/** The campaigns seeded from the Russian Ravenford; the accessibility scans' campaigns. */
const RUSSIAN: ReadonlySet<string> = new Set([
  campaigns.russian,
  campaigns.a11yRu,
  campaigns.dockRu,
]);
const SCANNED: ReadonlySet<string> = new Set([campaigns.a11y, campaigns.a11yRu]);

/**
 * The invitation-mode journeys' campaigns (`tests/e2e/fixtures/sign-in-campaigns.json`), each
 * owned by one journey: a Ravenford cloned through real commands — the Russian ones from the
 * Russian fixtures — with Elowen's seat released for an invited player. The accessibility
 * scans' campaigns keep her seated instead (a player who is not signed in) and add an empty
 * seat for Seren Ashgrove. Scripted checks all roll 15.
 */
export async function seedSignInCampaigns(store?: EventStore): Promise<WorldEngine> {
  const engine = await seededEngine(store, scriptedDice(Array<number>(512).fill(15)));
  const english = await loadRavenfordSeed();
  const russian = await loadRavenfordSeed(RAVENFORD_RU_FIXTURES_DIR);
  for (const campaignId of Object.values(campaigns)) {
    const seed = RUSSIAN.has(campaignId) ? russian : english;
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      await accept(engine, {
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
    }
    // Seren's empty seat: Elowen meets her unnamed, so her ID is opaque (ADR 0008, Gate 06).
    const seat = SCANNED.has(campaignId)
      ? {
          type: 'CreateEntity',
          entityId: 'character-4edddd60',
          kind: 'character',
          name: 'Seren Ashgrove',
          existsSince: null,
          placement: { locationId: 'market-square', since: null },
        }
      : { type: 'ReleaseCharacter', characterId: ELOWEN };
    await accept(engine, {
      commandId: `${campaignId}.sign-in.seat`,
      campaignId,
      actor: DM,
      command: seat,
    });
  }
  return engine;
}

/**
 * The operator's DM invitations for every journey campaign, as `pnpm auth:operator dm-invite`
 * stores them, with tokens derived from the run's seed (`ui-sign-in-links.ts`).
 */
export async function seedDmInvitations(credentials: CredentialStore, seed: string): Promise<void> {
  const now = Date.now();
  for (const campaignId of Object.values(campaigns)) {
    for (let index = 0; index < DM_INVITATIONS_PER_CAMPAIGN; index += 1) {
      await credentials.createInvitation({
        invitationId: randomUUID(),
        tokenHash: hashToken(dmInvitationToken(seed, campaignId, index)),
        campaignId,
        purpose: 'dm',
        characterId: null,
        createdBy: 'operator',
        createdAt: iso(now),
        expiresAt: iso(now + 72 * HOUR_MS),
        actorId: DM.actorId,
      });
    }
  }
}

async function accept(engine: WorldEngine, submission: unknown): Promise<void> {
  const result = await engine.execute(submission);
  if (result.status !== 'accepted') throw new Error('UI sign-in campaign seed was not accepted');
}
