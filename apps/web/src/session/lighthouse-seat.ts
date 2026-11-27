import type { SessionResponse } from '@ltw/contracts';

import { campaignTheme } from '../visual/campaign-themes/index.ts';

export function isLighthousePlayer(identity: SessionResponse) {
  return identity.role === 'PLAYER' && campaignTheme(identity.campaign.name)?.id === 'lighthouse';
}

const key = (identity: SessionResponse) =>
  `ltw.playing:${identity.campaign.campaignId}:${identity.actorId}`;

export function startingPerspective(identity: SessionResponse): string {
  const first = identity.perspectives[0]?.value ?? 'PUBLIC';
  if (!isLighthousePlayer(identity)) return first;
  try {
    const id = sessionStorage.getItem(key(identity));
    if (identity.characters.some((hero) => hero.entityId === id)) return `CHARACTER:${id}`;
  } catch {
    // A private browser may decline storage.
  }
  return first;
}

/** Keep the selected hero across a reload, only for this seat and only while the server grants it. */
export function rememberPerspective(identity: SessionResponse, perspective: string) {
  if (!isLighthousePlayer(identity)) return;
  try {
    const hero = identity.characters.find((item) => `CHARACTER:${item.entityId}` === perspective);
    if (hero) sessionStorage.setItem(key(identity), hero.entityId);
    else sessionStorage.removeItem(key(identity));
  } catch {
    // The session still works for the lifetime of the page.
  }
}
