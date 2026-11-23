import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';

/** The file as written, indentation included: only a guard against reading something huge. */
export const MAX_PACKAGE_FILE_BYTES = 2 * 1024 * 1024;
/** The content as it is sent: the server's own limit on a package (`MAX_CAMPAIGN_PACKAGE_BYTES`). */
export const MAX_PACKAGE_CONTENT_BYTES = 512 * 1024;

const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

/** Content only: source, identities and server assessment must never come from an uploaded file. */
export function parsePackageFile(text: string): CampaignPackage | null {
  if (bytes(text) > MAX_PACKAGE_FILE_BYTES) return null;
  try {
    const parsed = campaignPackageSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    // A pretty-printed file is larger than what is sent; whitespace must not refuse a package.
    return bytes(JSON.stringify(parsed.data)) <= MAX_PACKAGE_CONTENT_BYTES ? parsed.data : null;
  } catch {
    return null;
  }
}
