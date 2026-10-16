import { createHmac } from 'node:crypto';

/**
 * Test support (excluded from builds), shared by the invitation-mode browser-test server
 * (`ui-sign-in-server.ts`) and the journeys (`tests/e2e/support/sign-in.ts`); it imports no
 * workspace package, so the journeys need no build. The operator's DM invitations of those
 * campaigns are seeded when the server starts, with tokens derived from LTW_UI_SIGN_IN_SEED, a
 * random value `playwright.config.ts` creates for each run and hands to both: no token is
 * written to a file or a log.
 */
export const SIGN_IN_PORTS = { web: 4312, api: 4313 } as const;

/** The second Vite server's origin: the browser's, so the server's `PUBLIC_ORIGIN`. */
export const SIGN_IN_ORIGIN = `http://127.0.0.1:${String(SIGN_IN_PORTS.web)}`;

/** DM invitations seeded per campaign; each works once. */
export const DM_INVITATIONS_PER_CAMPAIGN = 3;

/** The run's seed; only `playwright.config.ts` sets it. */
export function signInSeed(): string {
  const seed = process.env['LTW_UI_SIGN_IN_SEED'];
  if (seed === undefined || seed.length < 32) {
    throw new Error(
      'LTW_UI_SIGN_IN_SEED is missing: start the journeys through playwright.config.ts',
    );
  }
  return seed;
}

/** The token of a campaign's `index`-th DM invitation: 32 bytes, base64url (43 characters). */
export function dmInvitationToken(seed: string, campaignId: string, index: number): string {
  return createHmac('sha256', seed)
    .update(`dm-invitation\n${campaignId}\n${String(index)}`)
    .digest('base64url');
}
