import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  CreatedTableLinkResponse,
  EnteredCampaignResponse,
  SessionResponse,
} from '@ltw/contracts';

import campaigns from '../../../../tests/e2e/fixtures/sign-in-campaigns.json' with { type: 'json' };
import type { CredentialStore } from '../auth/credential-store.ts';
import { HOUR_MS } from '../auth/sign-in.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { dmInvitationToken, SIGN_IN_ORIGIN } from './ui-sign-in-links.ts';

/** Prepare an isolated library copy using normal sign-in, library activation and table links.
 * The operator's two entry links go only to the local process that launched the rehearsal. */
export async function prepareLighthouse(
  app: FastifyInstance,
  credentials: CredentialStore,
  seed: string,
) {
  const jar = new Map<string, string>();
  async function call(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
    const response = await app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { origin: SIGN_IN_ORIGIN, cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') },
    });
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new Error(`Rehearsal ${method} ${url} returned ${String(response.statusCode)}`);
    for (const { name, value } of response.cookies) jar.set(name, value);
    return response;
  }
  await call('POST', '/auth/redeem', {
    token: dmInvitationToken(seed, campaigns.bookLibrary, 0),
    newAccount: {
      login: 'lighthouse-keeper',
      password: newToken(),
      displayName: 'Хранитель маяка',
    },
  });
  const pick = { libraryId: 'lighthouse', variantId: 'original-party', requestId: randomUUID() };
  let created = await call('POST', '/account/library-campaigns', pick);
  while (created.statusCode === 202)
    created = await call('POST', '/account/library-campaigns', pick);
  const { campaignId } = created.json<EnteredCampaignResponse>();
  const path = '/campaigns/' + campaignId;
  const started = await call('POST', path + '/commands', {
    commandId: randomUUID(),
    command: { type: 'StartSession', title: 'Первый огонь' },
  });
  if (started.json<{ status: string }>().status !== 'accepted')
    throw new Error('First session did not open');
  const { actorId } = (await call('GET', path + '/session')).json<SessionResponse>();
  const table = (
    await call('POST', path + '/table-link', { hours: 24 })
  ).json<CreatedTableLinkResponse>();
  const dm = newToken();
  const now = Date.now();
  await credentials.createInvitation({
    invitationId: randomUUID(),
    campaignId,
    purpose: 'dm',
    actorId,
    characterId: null,
    createdBy: 'local-rehearsal',
    tokenHash: hashToken(dm),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 24 * HOUR_MS).toISOString(),
  });
  return { player: table.link, dm: SIGN_IN_ORIGIN + '/join#' + dm };
}
