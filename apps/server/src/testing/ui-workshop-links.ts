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
  'scenario-en',
  'scenario-ru',
  'scenario-layout',
  'scenario-a11y',
  'scenario-generation',
  'scenario-retry',
  'scenario-unavailable',
  'scenario-revoked',
  'scenario-stale-a',
  'scenario-stale-b',
  'scenario-replacement',
  'scenario-cas',
  'scenario-correction',
  'scenario-cancel',
  'preview-en',
  'preview-ru',
  'preview-images',
  'preview-privacy',
  'preview-revoked',
  'preview-stale',
  'preview-a11y',
  'preview-layout',
  'preview-replacement',
  'preview-unavailable',
  'edit-en',
  'edit-ru',
  'edit-locks',
  'edit-images',
  'edit-restore',
  'edit-candidate',
  'edit-late',
  'edit-revoked',
  'edit-a11y',
  'edit-layout',
  'edit-unavailable',
  'activation-en',
  'activation-ru',
  'activation-pictures',
  'activation-text-only',
  'activation-layout',
  'activation-a11y',
  'activation-pending',
  'activation-revoked',
  'activation-coexist',
  'lazy-entry',
  'lazy-failure',
  'lazy-held',
  'demo-ru',
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

/** The Stage410 draft only; existing Stage380 owners keep their empty draft lists. */
export function workshopDraftId(seed: string, name: WorkshopFixture): string {
  const hex = createHmac('sha256', seed).update(`workshop-draft\n${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
