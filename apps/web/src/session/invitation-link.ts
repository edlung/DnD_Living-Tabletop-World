import { CREDENTIAL_TOKEN_PATTERN } from '@ltw/contracts';

/**
 * An invitation link is `<origin>/join#<token>` (docs/adr/0036-production-sign-in.md §1): the
 * token rides in the fragment, which no server, proxy or log ever receives.
 */
export const JOIN_PATH = '/join';

/** What the address held when the page opened: an invitation's token, or a join link without one. */
export type Invitation =
  { readonly kind: 'token'; readonly token: string } | { readonly kind: 'malformed' };

/**
 * Takes an invitation out of the address before anything is requested (ADR 0036 §7): on the
 * join path the fragment is read once, then the address bar and this history entry become the
 * plain start page (`history.replaceState`), so a reload, Back, a bookmark, a shared screen or a
 * later request never carries the token; from here on it lives only in memory. Any other
 * address is left alone.
 */
export function takeInvitation(
  location: Pick<Location, 'pathname' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): Invitation | null {
  if (location.pathname !== JOIN_PATH && location.pathname !== `${JOIN_PATH}/`) return null;
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  history.replaceState(null, '', '/');
  return CREDENTIAL_TOKEN_PATTERN.test(fragment)
    ? { kind: 'token', token: fragment }
    : { kind: 'malformed' };
}
