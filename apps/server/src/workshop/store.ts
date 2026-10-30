import type { CreateWorkshopDraft, WorkshopDraftView } from '@ltw/contracts';

export interface WorkshopInvitation {
  readonly invitationId: string;
  readonly ownerId: string;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly authorizationSource: string;
}
export interface WorkshopSession {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly tokenHash: string;
  readonly invitationId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}
export type RedeemedWorkshopSession = Omit<WorkshopSession, 'ownerId' | 'invitationId'>;
export type DraftCreation =
  { readonly kind: 'created'; readonly draft: WorkshopDraftView } | { readonly kind: 'conflict' };

export interface WorkshopStore {
  issueInvitation(input: WorkshopInvitation): Promise<void>;
  /** Check invitation, spend it, create session and replace old session atomically. */
  redeem(
    tokenHash: string,
    session: RedeemedWorkshopSession,
    previousHash: string | null,
  ): Promise<string | null>;
  session(tokenHash: string, now: string): Promise<WorkshopSession | null>;
  signOut(tokenHash: string, now: string): Promise<void>;
  /** Revoke under the same owner lock as issue/redeem; future grants may restore access. */
  revokeOwner(ownerId: string, now: string, authorizationSource: string): Promise<void>;
  createDraft(
    ownerId: string,
    input: CreateWorkshopDraft,
    draftId: string,
    now: string,
  ): Promise<DraftCreation>;
  draft(ownerId: string, draftId: string): Promise<WorkshopDraftView | null>;
  /** Descending stable creation order; exclusive cursor already authorized by caller. */
  drafts(
    ownerId: string,
    after: WorkshopDraftView | null,
    limit: number,
  ): Promise<readonly WorkshopDraftView[]>;
}
