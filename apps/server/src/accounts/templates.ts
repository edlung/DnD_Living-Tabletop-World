import { randomBytes, randomUUID } from 'node:crypto';

import type { CampaignTemplate } from '@ltw/contracts';
import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import type { CredentialStore } from '../auth/credential-store.ts';
import { iso, type AuthClock } from '../auth/session-authenticator.ts';
import { HOUR_MS, SESSION_MS } from '../auth/sign-in.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import type { AccountStore, SeatRecord } from './account-store.ts';

/**
 * A campaign from a ready adventure (docs/adr/0041-accounts.md §5): a fresh copy of Ravenford, its
 * seats free for the DM's invitations, the account its DM. The DM's seat descends from a DM
 * invitation the account receives and uses at once, so its sessions are ADR 0036's like any other.
 */
export interface CreatedCampaign {
  readonly campaignId: string;
  readonly seat: SeatRecord;
  /** The DM's campaign session, for the cookie. */
  readonly sessionToken: string;
}

const newCampaignId = () => `c-${randomBytes(6).toString('hex')}`;

export async function createFromTemplate(
  engine: WorldEngine,
  deps: {
    readonly accounts: AccountStore;
    readonly credentials: CredentialStore;
    readonly clock: AuthClock;
  },
  accountId: string,
  template: CampaignTemplate,
): Promise<CreatedCampaign> {
  const seed = await loadRavenfordSeed(
    template === 'ravenford-ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined,
  );
  const campaignId = newCampaignId();
  const seated: string[] = [];
  for (const input of seed.submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const result = await engine.execute({
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
    if (result.status === 'rejected') throw new Error(`template ${template} could not be copied`);
    if (submission.command.type === 'AssignCharacter') seated.push(submission.command.characterId);
  }
  // The fixture seats development personas: the copy frees them for the DM's invitations, after
  // every fixture command (some act as those characters).
  for (const characterId of seated) {
    const release = await engine.execute({
      campaignId,
      commandId: `${campaignId}.release.${characterId}`,
      actor: seed.dm,
      command: { type: 'ReleaseCharacter', characterId },
    });
    if (release.status === 'rejected') throw new Error(`template ${template} kept a seat`);
  }
  const dmActorId = (await engine.load(campaignId))?.state.campaign?.dmActorId;
  if (!dmActorId) throw new Error(`template ${template} has no DM`);

  // The DM's invitation, used at once by the account that created the campaign.
  const now = deps.clock.now();
  const invitationId = randomUUID();
  await deps.credentials.createInvitation({
    invitationId,
    tokenHash: hashToken(newToken()),
    campaignId,
    purpose: 'dm',
    characterId: null,
    createdBy: `account:${accountId}`,
    createdAt: iso(now),
    expiresAt: iso(now + HOUR_MS),
    actorId: dmActorId,
  });
  const sessionToken = newToken();
  const used = await deps.credentials.completeRedeem(
    invitationId,
    {
      sessionId: randomUUID(),
      tokenHash: hashToken(sessionToken),
      campaignId,
      actorId: dmActorId,
      invitationId,
      createdAt: iso(now),
      expiresAt: iso(now + SESSION_MS),
    },
    iso(now),
  );
  if (!used) throw new Error('the DM invitation of a new campaign was not used');
  const seat: SeatRecord = {
    accountId,
    campaignId,
    actorId: dmActorId,
    role: 'dm',
    invitationId,
    joinedAt: iso(now),
  };
  if (!(await deps.accounts.addSeat(seat))) throw new Error('the DM seat was not added');
  return { campaignId, seat, sessionToken };
}
