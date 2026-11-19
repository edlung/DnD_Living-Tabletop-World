import { createHash, randomUUID } from 'node:crypto';

import { campaignPackageSchema, type StartCampaignActivation } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';

import type { CredentialStore } from '../auth/credential-store.ts';
import type { AuthClock } from '../auth/session-authenticator.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import type { CampaignLibrary } from '../campaigns/library.ts';
import { loadCampaignActivationReview } from '../workshop/activation/review.ts';
import type { ActivationScope } from '../workshop/activation/store.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import type { AccountStore } from './account-store.ts';
import { enterSeat } from './accounts.ts';
import { seatAccountAsDm } from './dm-seat.ts';

/**
 * A library campaign the hub starts (docs/adr/0058-campaign-content.md, notes of 2026-11-19): the
 * server does for a signed-in account what the workshop does for an invited owner — the variant's
 * package saved into a fresh private draft, reviewed text-only, its activation begun — under an
 * internal workshop owner of this one creation, then waits for the activation worker to publish
 * it and seats the account as its DM through an ordinary DM invitation. The internal owner is
 * never a campaign principal for anyone (ADR 0038): it has no cookie, its session is signed out
 * at once, and it gets no generation, edit or picture grant. Every ID derives from the account and
 * the client's request ID, so a repeated request continues the same creation, never a second one.
 */
export interface LibraryCampaignDependencies {
  readonly engine: WorldEngine;
  readonly workshop: WorkshopDependencies;
  readonly library: CampaignLibrary;
  readonly accounts: AccountStore;
  readonly credentials: CredentialStore;
  readonly clock: AuthClock;
  /** How long one request waits for the worker before answering "still preparing". */
  readonly waitMs?: number;
  readonly pollMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export type LibraryCampaignResult =
  | { readonly kind: 'entered'; readonly campaignId: string; readonly sessionToken: string }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'failed'; readonly reason: string };

const INTERNAL_GRANT = 'account-library';
const WAIT_MS = 120_000;
const POLL_MS = 500;
const INTERNAL_SESSION_MS = 60 * 60_000;

/** A UUID (version 4 layout) derived from the account, the request and a part's name. */
export function derivedId(accountId: string, requestId: string, part: string): string {
  const hex = createHash('sha256')
    .update(`ltw-account-library\u0000${accountId}\u0000${requestId}\u0000${part}`)
    .digest('hex');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** One creation's internal workshop scope and request IDs, the same for every repeat of it. */
export function libraryCreationIds(
  accountId: string,
  input: { readonly requestId: string; readonly libraryId: string; readonly variantId: string },
) {
  const id = (part: string) =>
    derivedId(accountId, input.requestId, `${input.libraryId}/${input.variantId}/${part}`);
  return {
    scope: { ownerId: id('owner'), draftId: id('draft') } satisfies ActivationScope,
    request: id('activation'),
    draftRequest: id('draft-request'),
    revisionRequest: id('revision'),
  };
}

/** A short-lived session of the internal owner, needed to begin the activation; signed out after. */
async function internalSession(deps: LibraryCampaignDependencies, ownerId: string) {
  const { store } = deps.workshop;
  const now = deps.clock.now();
  const invitationToken = newToken();
  await store.issueInvitation({
    invitationId: randomUUID(),
    ownerId,
    tokenHash: hashToken(invitationToken),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    authorizationSource: INTERNAL_GRANT,
  });
  const tokenHash = hashToken(newToken());
  const sessionId = randomUUID();
  const redeemed = await store.redeem(
    hashToken(invitationToken),
    {
      sessionId,
      tokenHash,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + INTERNAL_SESSION_MS).toISOString(),
    },
    null,
  );
  if (redeemed === null) throw new Error('LIBRARY_INTERNAL_SESSION');
  return { sessionId, tokenHash };
}

/** Saves the package into its draft and begins its activation; nothing when already begun. */
async function begin(
  deps: LibraryCampaignDependencies,
  scope: ActivationScope,
  ids: {
    readonly request: string;
    readonly draftRequest: string;
    readonly revisionRequest: string;
  },
  title: string,
  packageJson: string,
): Promise<{ readonly kind: 'begun' } | { readonly kind: 'failed'; readonly reason: string }> {
  const { workshop } = deps;
  const { activation, packages } = workshop;
  if (!activation || !packages) return { kind: 'failed', reason: 'UNAVAILABLE' };
  if (await activation.repository.byRequest(scope, ids.request)) return { kind: 'begun' };
  const content = campaignPackageSchema.parse(JSON.parse(packageJson));
  const now = () => new Date(deps.clock.now()).toISOString();
  const session = await internalSession(deps, scope.ownerId);
  try {
    const draft = await workshop.store.createDraft(
      scope.ownerId,
      { requestId: ids.draftRequest, title: title.slice(0, 120), language: content.world.language },
      scope.draftId,
      now(),
    );
    if (draft.kind !== 'created') return { kind: 'failed', reason: 'DRAFT' };
    const saved = await packages.append({
      ownerId: scope.ownerId,
      draftId: scope.draftId,
      requestId: ids.revisionRequest,
      basedOnRevision: 0,
      expectedLockVersion: 0,
      content,
      source: { kind: 'OWNER', actorId: scope.ownerId },
      createdAt: now(),
    });
    if (saved.kind !== 'saved') return { kind: 'failed', reason: 'REVISION' };
    const reviewed = await loadCampaignActivationReview(workshop, scope, { textOnly: true });
    if (!reviewed?.frozen || !reviewed.review.confirmable)
      return { kind: 'failed', reason: 'NOT_READY' };
    const { review, frozen } = reviewed;
    // The account's press on the hub is its consent: the library campaign starts as written, its
    // warnings (reviewed when the library was built) acknowledged as the workshop owner would.
    const request: StartCampaignActivation = {
      requestId: ids.request,
      revision: review.revision,
      packageDigest: review.packageDigest,
      planDigest: review.planDigest,
      manifestVersion: review.manifestVersion,
      manifestDigest: review.manifestDigest,
      expectedLockVersion: review.lockVersion,
      lockDigest: review.lockDigest,
      reviewDigest: review.reviewDigest,
      textOnly: true,
      acknowledgedFindingIds: review.findings
        .filter((finding) => finding.severity === 'warning')
        .map((finding) => finding.findingId),
    };
    const begun = await activation.repository.begin({
      ...scope,
      authSessionId: session.sessionId,
      request,
      frozen: { ...frozen, acknowledgedFindingIds: [...request.acknowledgedFindingIds].sort() },
    });
    return begun.kind === 'not-found' || begun.kind === 'conflict'
      ? { kind: 'failed', reason: begun.kind === 'conflict' ? begun.reason : 'NOT_FOUND' }
      : { kind: 'begun' };
  } finally {
    await workshop.store.signOut(session.tokenHash, now());
  }
}

/** The account's DM session in a published campaign: its seat, made now or found again. */
async function enter(
  deps: LibraryCampaignDependencies,
  accountId: string,
  campaignId: string,
): Promise<LibraryCampaignResult> {
  const seated = (await deps.accounts.seats(accountId)).find(
    (seat) => seat.campaignId === campaignId,
  );
  if (seated) {
    const token = await enterSeat(deps.engine, deps, seated);
    return token === null
      ? { kind: 'failed', reason: 'SEAT' }
      : { kind: 'entered', campaignId, sessionToken: token };
  }
  const dmActorId = (await deps.engine.load(campaignId))?.state.campaign?.dmActorId;
  if (!dmActorId) return { kind: 'failed', reason: 'NO_DM' };
  const { sessionToken } = await seatAccountAsDm(deps, accountId, campaignId, dmActorId);
  return { kind: 'entered', campaignId, sessionToken };
}

export async function startLibraryCampaign(
  deps: LibraryCampaignDependencies,
  input: {
    readonly accountId: string;
    readonly requestId: string;
    readonly libraryId: string;
    readonly variantId: string;
  },
): Promise<LibraryCampaignResult> {
  const activation = deps.workshop.activation;
  if (!activation) return { kind: 'failed', reason: 'UNAVAILABLE' };
  const entry = deps.library.entries.find((candidate) => candidate.id === input.libraryId);
  const packageJson = deps.library.packageJson(input.libraryId, input.variantId);
  if (!entry || packageJson === null) return { kind: 'not-found' };
  const ids = libraryCreationIds(input.accountId, input);
  const { scope } = ids;
  const begun = await begin(deps, scope, ids, entry.title, packageJson);
  if (begun.kind === 'failed') return begun;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const deadline = deps.clock.now() + (deps.waitMs ?? WAIT_MS);
  for (;;) {
    const status = await activation.repository.status(scope);
    if (status?.status === 'PUBLISHED') return enter(deps, input.accountId, status.campaignId);
    if (status?.failureCode && !status.retryable)
      return { kind: 'failed', reason: status.failureCode };
    if (deps.clock.now() >= deadline) return { kind: 'preparing' };
    await sleep(deps.pollMs ?? POLL_MS);
  }
}
