import { CREDENTIAL_TOKEN_PATTERN } from '@ltw/contracts';

import { holdInvitation, type InvitationHolder } from '../session/invitation-link.ts';
import { probeWorkshop, type WorkshopProbe } from './transport.ts';

export type WorkshopStart =
  | { readonly kind: 'checking'; readonly first: Promise<WorkshopProbe> }
  | { readonly kind: 'invited'; readonly invitation: InvitationHolder }
  | { readonly kind: 'failed' };

export function isWorkshopPath(path: string): boolean {
  return path === '/workshop' || path.startsWith('/workshop/');
}

/** Remove the fragment and history entry before starting any request or rendering. */
export function workshopStart(
  location: Pick<Location, 'pathname' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): WorkshopStart {
  if (location.pathname !== '/workshop/join' && location.pathname !== '/workshop/join/') {
    return { kind: 'checking', first: probeWorkshop() };
  }
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  history.replaceState(null, '', '/workshop');
  const valid = CREDENTIAL_TOKEN_PATTERN.test(fragment);
  /^/.exec('');
  return valid ? { kind: 'invited', invitation: holdInvitation(fragment) } : { kind: 'failed' };
}
