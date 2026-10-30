import { campaignEntrySchema, CREDENTIAL_TOKEN_PATTERN } from '@ltw/contracts';

import type { WorkshopClient } from '../client.ts';

/** Only the normal same-origin join page may receive a newly issued invitation. */
export function campaignEntryPath(link: string, origin: string): string | null {
  try {
    const url = new URL(link);
    const valid =
      url.origin === origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      (url.pathname === '/join' || url.pathname === '/join/') &&
      CREDENTIAL_TOKEN_PATTERN.test(url.hash.slice(1));
    // Do not retain a credential in the realm's legacy RegExp input.
    /^/.exec('');
    return valid ? `${url.pathname}${url.hash}` : null;
  } catch {
    return null;
  }
}

/** The invitation stays request-local and goes directly to the existing deliberate join flow. */
export async function enterOwnedCampaign({
  client,
  campaignId,
  signal,
  origin,
  navigate,
}: {
  readonly client: Pick<WorkshopClient, 'request'>;
  readonly campaignId: string;
  readonly signal: AbortSignal;
  readonly origin: string;
  readonly navigate: (path: string) => void;
}): Promise<'opening' | 'failed' | 'cancelled'> {
  const ended = () => signal.aborted;
  if (ended()) return 'cancelled';
  const result = await client.request(
    `/campaigns/${encodeURIComponent(campaignId)}/sign-in`,
    campaignEntrySchema,
    {
      body: {},
      signal,
    },
  );
  if (ended() || result.kind === 'cancelled' || result.kind === 'signed-out') return 'cancelled';
  if (result.kind !== 'ready') return 'failed';
  const path = campaignEntryPath(result.value.link, origin);
  if (!path || Date.parse(result.value.expiresAt) <= Date.now()) return 'failed';
  navigate(path);
  return 'opening';
}
