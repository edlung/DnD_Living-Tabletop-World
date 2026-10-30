import { createHmac } from 'node:crypto';

/** Per-run fixtures only; no invitation credential is written to disk or logged. */
export const WORKSHOP_FIXTURES = [
  'journey',
  'private-a',
  'private-b',
  'replace-a',
  'replace-b',
  'keep-a',
  'keep-b',
  'unused',
  'keyboard',
  'russian',
  'retry',
  'revoked',
  'coexist',
  'layout',
  'a11y',
  'stale-a',
  'stale-b',
] as const;
export type WorkshopFixture = (typeof WORKSHOP_FIXTURES)[number];
export const WORKSHOP_CAMPAIGN = 'ui-workshop-coexist';
export function workshopInvitationToken(seed: string, name: WorkshopFixture): string {
  return createHmac('sha256', seed).update(`workshop-invitation\n${name}`).digest('base64url');
}
export function workshopOwnerId(seed: string, name: WorkshopFixture): string {
  const hex = createHmac('sha256', seed).update(`workshop-owner\n${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
