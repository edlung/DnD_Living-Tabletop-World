import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';

export const MAX_PACKAGE_FILE_BYTES = 512 * 1024;
/** Content only: source, identities and server assessment must never come from an uploaded file. */
export function parsePackageFile(text: string): CampaignPackage | null {
  if (new TextEncoder().encode(text).byteLength > MAX_PACKAGE_FILE_BYTES) return null;
  try {
    const parsed = campaignPackageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
