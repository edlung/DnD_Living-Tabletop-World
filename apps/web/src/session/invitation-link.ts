import { CREDENTIAL_TOKEN_PATTERN } from '@ltw/contracts';

/**
 * An invitation link is `<origin>/join#<token>` (docs/adr/0036-production-sign-in.md §1): the
 * token rides in the fragment, which no server, proxy or log ever receives.
 */
export const JOIN_PATH = '/join';

/**
 * An invitation's token, held in this closure only — never in React state, props, storage or a
 * URL (docs/STAGE_340_DESIGN.md "Part B review fixes"). It is one-shot: `take` hands it out and
 * forgets it at once, so after the person keeps their sign-in, replaces it, joins or fails, no
 * holder can give it again.
 */
export interface InvitationHolder {
  /** Whether the token is still held. */
  readonly holds: () => boolean;
  /** The token, forgotten as it is taken; null once it is gone. */
  readonly take: () => string | null;
  /** Forgets the token unused. */
  readonly forget: () => void;
}

export function holdInvitation(token: string): InvitationHolder {
  let held: string | null = token;
  return {
    holds: () => held !== null,
    take: () => {
      const taken = held;
      held = null;
      return taken;
    },
    forget: () => {
      held = null;
    },
  };
}

/**
 * Takes an invitation out of the address before anything is requested or rendered (ADR 0036
 * §7): on the join path the fragment is read once, then the address bar and this history entry
 * become the plain start page (`history.replaceState`), so a reload, Back, a bookmark, a shared
 * screen or a later request never carries the token. A well-formed token goes straight into its
 * one-shot holder; nothing is sent until the person takes their seat. Any other address is left
 * alone.
 */
export function takeInvitation(
  location: Pick<Location, 'pathname' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): InvitationHolder | 'malformed' | null {
  if (location.pathname !== JOIN_PATH && location.pathname !== `${JOIN_PATH}/`) return null;
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  history.replaceState(null, '', '/');
  const wellFormed = CREDENTIAL_TOKEN_PATTERN.test(fragment);
  // A successful match leaves its subject in the realm's legacy `RegExp.input` (`RegExp.$_`):
  // match an empty string so the token is not kept there.
  /^/.exec('');
  return wellFormed ? holdInvitation(fragment) : 'malformed';
}
