import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  campaignPackageSchema,
  type CampaignLibraryEntry,
  type CampaignRevision,
} from '@ltw/contracts';
import { z } from 'zod';

import { curatedSetOf, type CuratedSet } from '../images/curated-set.ts';
import { campaignCanonicalJson } from '../workshop/packages/content.ts';

/**
 * The campaign library (work-orders/CAMPAIGN_LIBRARY_RELEASE_2026-11-14.md; docs/adr/0058, notes of
 * 2026-11-14): the authored campaigns a DM picks in the workshop. `fixtures/campaign-library/` is
 * written by `scripts/campaign-library/build.ts`; each campaign's pictures are read from its own
 * `campaigns/…/assets/` and checked against their SHA-256 here, once, at start.
 */
export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export const CAMPAIGN_LIBRARY_DIR = join(REPOSITORY_ROOT, 'fixtures/campaign-library');

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const variantId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);
const relativePath = z
  .string()
  .regex(/^campaigns\/[a-z0-9/-]+\.webp$/)
  .refine((path) => !path.split('/').includes('..'));
const pictureSchema = z
  .object({
    file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.webp$/),
    source: relativePath,
    sha256,
    originalSha256: sha256,
    generated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    prompt: z.string().min(1),
    references: z.array(z.string().min(1)),
    variant: z.enum(ASSET_VARIANTS),
    label: z.string().nullable(),
    purpose: z.enum(ASSET_PURPOSES),
    derivedFrom: z.string().nullable(),
    subjects: z.record(variantId, z.array(z.string().min(1))),
  })
  .strict();
const libraryFileSchema = z
  .object({
    id,
    title: z.string().min(1).max(160),
    genre: z.string().min(1).max(80),
    audience: z.string().regex(/^\d{1,2}\+$/),
    pitch: z.string().min(1).max(2000),
    tone: z.string().max(2000),
    duration: z.string().max(400),
    cover: relativePath,
    defaultVariant: variantId,
    variants: z
      .array(
        z
          .object({
            id: variantId,
            players: z.number().int().min(1).max(8),
            label: z.string().min(1).max(80),
            file: z.string().regex(/^packages\/[a-z0-9-]+\.json$/),
            digest: sha256,
          })
          .strict(),
      )
      .min(1),
    generator: z.string().min(1).max(100),
    pictures: z.array(pictureSchema),
  })
  .strict();
type LibraryFile = z.infer<typeof libraryFileSchema>;

interface LoadedCampaign {
  readonly file: LibraryFile;
  readonly packages: ReadonlyMap<string, string>;
  readonly cover: Uint8Array;
  readonly bytes: ReadonlyMap<string, Uint8Array>;
}

export interface CampaignLibrary {
  /** What the workshop lists, in library order. */
  readonly entries: readonly CampaignLibraryEntry[];
  /** A campaign's cover picture (WebP), or null. */
  cover(campaignId: string): Uint8Array | null;
  /** A variant's package as compact JSON, exactly as the library ships it, or null. */
  packageJson(campaignId: string, variantId: string): string | null;
  /**
   * The curated pictures of the campaign a revision is, bound to its entities; null when the
   * revision is not, byte for byte in canonical form, one of the library's packages.
   */
  picturesFor(
    revision: CampaignRevision,
  ): { readonly title: string; readonly set: CuratedSet } | null;
}

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

async function readChecked(root: string, path: string, expected: string): Promise<Uint8Array> {
  const full = normalize(join(root, path));
  if (!full.startsWith(normalize(root))) throw new Error(`${path}: outside the repository`);
  const bytes = new Uint8Array(await readFile(full));
  if (hash(bytes) !== expected) throw new Error(`${path}: does not match its SHA-256`);
  return bytes;
}

export async function loadCampaignLibrary(
  directory: string = CAMPAIGN_LIBRARY_DIR,
  root: string = REPOSITORY_ROOT,
): Promise<CampaignLibrary> {
  const index = z
    .object({ campaigns: z.array(id) })
    .strict()
    .parse(JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')));
  const campaigns = new Map<string, LoadedCampaign>();
  const byDigest = new Map<string, { campaign: string; variant: string }>();
  for (const campaignId of index.campaigns) {
    const file = libraryFileSchema.parse(
      JSON.parse(await readFile(join(directory, campaignId, 'library.json'), 'utf8')),
    );
    if (file.id !== campaignId) throw new Error(`${campaignId}: library.json names ${file.id}`);
    const packages = new Map<string, string>();
    for (const variant of file.variants) {
      const text = await readFile(join(directory, campaignId, variant.file), 'utf8');
      const content = campaignPackageSchema.parse(JSON.parse(text));
      if (hash(campaignCanonicalJson(content)) !== variant.digest)
        throw new Error(`${campaignId}/${variant.id}: package digest changed`);
      if (content.party.length !== variant.players)
        throw new Error(`${campaignId}/${variant.id}: party size`);
      packages.set(variant.id, text);
      byDigest.set(variant.digest, { campaign: campaignId, variant: variant.id });
    }
    if (!packages.has(file.defaultVariant))
      throw new Error(`${campaignId}: no default variant ${file.defaultVariant}`);
    const bytes = new Map<string, Uint8Array>();
    for (const picture of file.pictures)
      bytes.set(picture.file, await readChecked(root, picture.source, picture.sha256));
    const coverBytes = await readFile(join(root, file.cover));
    campaigns.set(campaignId, { file, packages, cover: new Uint8Array(coverBytes), bytes });
  }
  const entries: CampaignLibraryEntry[] = [...campaigns.values()].map(({ file }) => ({
    id: file.id,
    title: file.title,
    genre: file.genre,
    audience: file.audience,
    pitch: file.pitch,
    tone: file.tone,
    duration: file.duration,
    pictures: file.pictures.length,
    defaultVariant: file.defaultVariant,
    variants: file.variants.map(({ id: variantId, players, label }) => ({
      id: variantId,
      players,
      label,
    })),
  }));
  return {
    entries,
    cover: (campaignId) => campaigns.get(campaignId)?.cover.slice() ?? null,
    packageJson: (campaignId, variantId) =>
      campaigns.get(campaignId)?.packages.get(variantId) ?? null,
    picturesFor: (revision) => {
      const found = byDigest.get(hash(campaignCanonicalJson(revision.content)));
      const campaign = found ? campaigns.get(found.campaign) : undefined;
      if (!found || !campaign) return null;
      const ids = (keys: readonly string[]) =>
        keys.flatMap((key) => {
          const entityId = revision.identities.entities[key];
          return entityId ? [entityId] : [];
        });
      const bound = campaign.file.pictures
        .map((picture) => ({ picture, entityIds: ids(picture.subjects[found.variant] ?? []) }))
        .filter(({ entityIds }) => entityIds.length > 0);
      const kept = new Set(bound.map(({ picture }) => picture.file));
      const assets = bound
        // A derived picture needs its reference bound to the same entities.
        .filter(({ picture }) => picture.derivedFrom === null || kept.has(picture.derivedFrom))
        .map(({ picture, entityIds }) => ({
          file: picture.file,
          entityIds,
          variant: picture.variant,
          label: picture.label,
          purpose: picture.purpose,
          derivedFrom: picture.derivedFrom,
          mediaType: 'image/webp',
          sha256: picture.sha256,
          originalSha256: picture.originalSha256,
          generated: picture.generated,
          references: [...picture.references],
          prompt: picture.prompt,
        }));
      if (assets.length === 0) return null;
      const set = curatedSetOf(
        {
          about: `Original artwork for ${campaign.file.title}.`,
          generator: campaign.file.generator,
          assets,
        },
        campaign.bytes,
      );
      return { title: campaign.file.title, set };
    },
  };
}
