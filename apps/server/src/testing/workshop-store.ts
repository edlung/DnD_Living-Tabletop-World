import type { CreateWorkshopDraft, WorkshopDraftView } from '@ltw/contracts';

import type {
  WorkshopInvitation,
  WorkshopSession,
  WorkshopStore,
  RedeemedWorkshopSession,
  DraftCreation,
} from '../workshop/store.ts';

/** Test-only reference semantics. Production uses PostgreSQL (no async gaps inside a mutation). */
export class MemoryWorkshopStore implements WorkshopStore {
  readonly invitations = new Map<
    string,
    WorkshopInvitation & { used: boolean; revoked: boolean }
  >();
  readonly sessions = new Map<string, WorkshopSession & { revokedAt: string | null }>();
  readonly revocations: { ownerId: string; at: string; authorizationSource: string }[] = [];
  readonly #drafts = new Map<string, WorkshopDraftView & { ownerId: string; requestId: string }>();
  issueInvitation(input: WorkshopInvitation): Promise<void> {
    this.invitations.set(input.tokenHash, { ...input, used: false, revoked: false });
    return Promise.resolve();
  }
  redeem(
    hash: string,
    session: RedeemedWorkshopSession,
    previous: string | null,
  ): Promise<string | null> {
    const invite = this.invitations.get(hash);
    if (
      !invite ||
      invite.used ||
      invite.revoked ||
      invite.expiresAt <= session.createdAt ||
      invite.createdAt > session.createdAt
    )
      return Promise.resolve(null);
    invite.used = true;
    this.sessions.set(session.tokenHash, {
      ...session,
      ownerId: invite.ownerId,
      invitationId: invite.invitationId,
      revokedAt: null,
    });
    if (previous !== null) {
      const old = this.sessions.get(previous);
      if (old) old.revokedAt ??= session.createdAt;
    }
    return Promise.resolve(invite.ownerId);
  }
  session(hash: string, now: string): Promise<WorkshopSession | null> {
    const value = this.sessions.get(hash);
    return Promise.resolve(
      value && value.revokedAt === null && value.createdAt <= now && value.expiresAt > now
        ? value
        : null,
    );
  }
  signOut(hash: string, now: string): Promise<void> {
    const value = this.sessions.get(hash);
    if (value) value.revokedAt ??= now;
    return Promise.resolve();
  }
  revokeOwner(ownerId: string, now: string, authorizationSource: string): Promise<void> {
    this.revocations.push({ ownerId, at: now, authorizationSource });
    for (const invite of this.invitations.values())
      if (invite.ownerId === ownerId) invite.revoked = true;
    for (const session of this.sessions.values())
      if (session.ownerId === ownerId) session.revokedAt ??= now;
    return Promise.resolve();
  }
  createDraft(
    ownerId: string,
    input: CreateWorkshopDraft,
    draftId: string,
    now: string,
  ): Promise<DraftCreation> {
    const previous = [...this.#drafts.values()].find(
      (draft) => draft.ownerId === ownerId && draft.requestId === input.requestId,
    );
    if (previous)
      return Promise.resolve(
        previous.title === input.title && previous.language === input.language
          ? { kind: 'created', draft: this.#view(previous) }
          : { kind: 'conflict' },
      );
    const draft = {
      draftId,
      ownerId,
      requestId: input.requestId,
      title: input.title,
      language: input.language,
      createdAt: now,
    };
    this.#drafts.set(draftId, draft);
    return Promise.resolve({ kind: 'created', draft: this.#view(draft) });
  }
  draft(ownerId: string, draftId: string): Promise<WorkshopDraftView | null> {
    const value = this.#drafts.get(draftId);
    return Promise.resolve(value?.ownerId === ownerId ? this.#view(value) : null);
  }
  drafts(
    ownerId: string,
    after: WorkshopDraftView | null,
    limit: number,
  ): Promise<readonly WorkshopDraftView[]> {
    return Promise.resolve(
      [...this.#drafts.values()]
        .filter(
          (draft) =>
            draft.ownerId === ownerId &&
            (!after ||
              draft.createdAt < after.createdAt ||
              (draft.createdAt === after.createdAt && draft.draftId < after.draftId)),
        )
        .sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.draftId.localeCompare(a.draftId),
        )
        .slice(0, limit)
        .map((draft) => this.#view(draft)),
    );
  }
  #view(draft: WorkshopDraftView): WorkshopDraftView {
    return {
      draftId: draft.draftId,
      title: draft.title,
      language: draft.language,
      createdAt: draft.createdAt,
    };
  }
}
