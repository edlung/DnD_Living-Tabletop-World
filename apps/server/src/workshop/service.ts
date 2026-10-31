import { randomUUID } from 'node:crypto';

import { MAX_INVITATION_HOURS, SESSION_DAYS, workshopIdSchema } from '@ltw/contracts';

import type { RequestLimits } from '../auth/limits.ts';
import type { AuthClock } from '../auth/session-authenticator.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import type { WorkshopStore } from './store.ts';
import type { CampaignGenerationDependencies } from './generation/runtime.ts';
import type { CampaignRevisionRepository } from './packages/store.ts';
import type { DraftImageDependencies } from './images/runtime.ts';
import type { CampaignRevisionControlRepository } from './revisions/store.ts';
import type {
  CampaignActivationDependencies,
  CampaignEntryDependencies,
} from './activation/runtime.ts';

export interface WorkshopDependencies {
  readonly store: WorkshopStore;
  readonly publicOrigin: string;
  readonly clock: AuthClock;
  readonly limits: RequestLimits;
  readonly packages?: CampaignRevisionRepository;
  readonly generation?: CampaignGenerationDependencies;
  readonly cancelGeneration?: (jobId: string) => void;
  readonly images?: DraftImageDependencies;
  readonly cancelImage?: (jobId: string) => void;
  readonly revisionControls?: CampaignRevisionControlRepository;
  readonly edits?: CampaignGenerationDependencies;
  readonly cancelEdit?: (jobId: string) => void;
  readonly activation?: CampaignActivationDependencies;
  readonly campaignEntry?: CampaignEntryDependencies;
}
export const WORKSHOP_SESSION_MS = SESSION_DAYS * 24 * 60 * 60_000;

export async function issueWorkshopInvitation(
  deps: Pick<WorkshopDependencies, 'store' | 'publicOrigin' | 'clock'>,
  input: { readonly ownerId: string; readonly hours: number; readonly authorizationSource: string },
): Promise<{ readonly invitationId: string; readonly ownerId: string; readonly link: string }> {
  if (
    !workshopIdSchema.safeParse(input.ownerId).success ||
    !Number.isInteger(input.hours) ||
    input.hours < 1 ||
    input.hours > MAX_INVITATION_HOURS ||
    input.authorizationSource.trim() === '' ||
    input.authorizationSource.length > 200 ||
    /\p{Cc}/u.test(input.authorizationSource)
  )
    throw new Error('INVALID_WORKSHOP_GRANT');
  const token = newToken();
  const invitationId = randomUUID();
  const now = deps.clock.now();
  await deps.store.issueInvitation({
    invitationId,
    ownerId: input.ownerId,
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + input.hours * 60 * 60_000).toISOString(),
    authorizationSource: input.authorizationSource,
  });
  return {
    invitationId,
    ownerId: input.ownerId,
    link: `${deps.publicOrigin}/workshop/join#${token}`,
  };
}
