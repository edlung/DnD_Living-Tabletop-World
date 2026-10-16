import type { SessionResponse } from '@ltw/contracts';

import { probeSession, readIdentity, type SignInIdentity } from './sign-in-flow.ts';

/**
 * Whether the browser's sign-in is still the one a tab shows (docs/adr/0036-production-sign-in.md
 * §7; docs/STAGE_340_DESIGN.md "Part B review fixes"). The session cookie belongs to the browser,
 * not to a tab: another tab can sign out, or replace the sign-in with another invitation, while
 * this one still shows the previous sign-in's world — and would send its actions under the new
 * one. A 401 says so by itself; anything else that a changed sign-in would explain is a doubt —
 * a refusal (403, 404), the live stream refused or closed as `gone` or `forbidden`, the browser
 * back online, the tab shown again — and the tab then asks the server who this browser is now.
 */

/** `same`: the sign-in this tab shows; `changed`: signed out, or someone else; `unknown`: no answer. */
export type SignInCheck = 'same' | 'changed' | 'unknown';

/** Whose world a campaign's `session` view opens. */
export const identityOfSession = (session: SessionResponse): SignInIdentity => ({
  campaignId: session.campaign.campaignId,
  actorId: session.actorId,
  role: session.role,
  characterId: session.character?.entityId ?? null,
});

export const sameSignIn = (a: SignInIdentity, b: SignInIdentity): boolean =>
  a.campaignId === b.campaignId &&
  a.actorId === b.actorId &&
  a.role === b.role &&
  a.characterId === b.characterId;

/**
 * Asks `GET /auth/session`, then the campaign's `session` view: a 401 (or no seat any more),
 * another campaign, or another actor, role or character than `shown` is a change. Until the tab
 * has read its identity, the campaign alone is compared.
 */
export async function checkSignIn(
  transport: typeof fetch,
  campaignId: string,
  shown: SignInIdentity | null,
  signal?: AbortSignal,
): Promise<SignInCheck> {
  const probe = await probeSession(transport, signal);
  if (probe.kind === 'signed-out') return 'changed';
  if (probe.kind !== 'signed-in') return 'unknown';
  if (probe.campaignId !== campaignId) return 'changed';
  if (shown === null) return 'same';
  const reading = await readIdentity(transport, campaignId, signal);
  if (reading.kind === 'unknown') return 'unknown';
  return reading.kind === 'signed-in' && sameSignIn(shown, reading.identity) ? 'same' : 'changed';
}

/**
 * The watch over one session screen. The first identity the screen reads is what the tab shows; a
 * later read naming someone else is a change at once. A doubt asks the server (one question at a
 * time; a doubt meanwhile asks once more afterwards, since that question may have left before the
 * change). A change is reported once, and a closed watch asks and reports nothing.
 */
export class SignInWatch {
  readonly #transport: typeof fetch;
  readonly #campaignId: string;
  readonly #onChanged: () => void;
  readonly #controller = new AbortController();
  #shown: SignInIdentity | null = null;
  #asking = false;
  #again = false;
  #closed = false;

  constructor(options: {
    readonly transport: typeof fetch;
    readonly campaignId: string;
    readonly onChanged: () => void;
  }) {
    this.#transport = options.transport;
    this.#campaignId = options.campaignId;
    this.#onChanged = options.onChanged;
  }

  /** An identity the server gave this session's screen. */
  observe(session: SessionResponse): void {
    if (this.#closed) return;
    const seen = identityOfSession(session);
    if (this.#shown === null && seen.campaignId === this.#campaignId) this.#shown = seen;
    else if (this.#shown === null || !sameSignIn(this.#shown, seen)) this.#change();
  }

  /** Something a changed sign-in would explain: ask the server who this browser is now. */
  doubt(): void {
    if (this.#closed) return;
    if (this.#asking) {
      this.#again = true;
      return;
    }
    this.#asking = true;
    void checkSignIn(this.#transport, this.#campaignId, this.#shown, this.#controller.signal).then(
      (verdict) => {
        this.#asking = false;
        if (this.#closed) return;
        if (verdict === 'changed') {
          this.#change();
        } else if (this.#again) {
          this.#again = false;
          this.doubt();
        }
      },
    );
  }

  /** The screen left this session: nothing more is asked or reported. */
  close(): void {
    this.#closed = true;
    this.#controller.abort();
  }

  #change(): void {
    this.close();
    this.#onChanged();
  }
}

/**
 * Calls `onReturn` when the browser comes back online or the tab is shown again — the moments a
 * tab may find its browser signed in differently. Returns the unsubscribe.
 */
export function watchReturns(
  win: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  doc: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
    readonly visibilityState: DocumentVisibilityState;
  },
  onReturn: () => void,
): () => void {
  const online = () => {
    onReturn();
  };
  const shown = () => {
    if (doc.visibilityState === 'visible') onReturn();
  };
  win.addEventListener('online', online);
  doc.addEventListener('visibilitychange', shown);
  return () => {
    win.removeEventListener('online', online);
    doc.removeEventListener('visibilitychange', shown);
  };
}
