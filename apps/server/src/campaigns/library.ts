import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  bookReferenceProblems,
  campaignBookSchema,
  campaignPackageSchema,
  type CampaignBook,
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
    /** The DM's book (ADR 0074 §2); absent from a library built before Stage 910. */
    book: z
      .object({ file: z.literal('book.json'), sha256 })
      .strict()
      .exactOptional(),
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
  /**
   * The campaign's book, read into its shape when first asked for: its bytes are checked at start
   * with everything else, but fifty-three books are not parsed for a server that opens none.
   */
  readonly book: () => CampaignBook | null;
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
  /**
   * The DM's book of the campaign a revision is (ADR 0074 §2.7, §3.1): recognised as its pictures
   * are, or — for a package the library no longer ships as it is — by the campaign's name when
   * every key the book names exists in the revision. Null otherwise. The book's keys are the
   * package's local keys: the revision's identities resolve them.
   */
  bookFor(
    revision: CampaignRevision,
  ): { readonly campaign: string; readonly book: CampaignBook } | null;
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
    let bookText: string | null = null;
    if (file.book) {
      bookText = await readFile(join(directory, campaignId, file.book.file), 'utf8');
      if (hash(bookText) !== file.book.sha256) throw new Error(`${campaignId}: book.json changed`);
    }
    let parsed: CampaignBook | null = null;
    const book = () => {
      if (bookText === null) return null;
      parsed ??= campaignBookSchema.parse(JSON.parse(bookText));
      return parsed;
    };
    campaigns.set(campaignId, { file, packages, cover: new Uint8Array(coverBytes), bytes, book });
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
    bookFor: (revision) => {
      const found = byDigest.get(hash(campaignCanonicalJson(revision.content)));
      const book = found ? campaigns.get(found.campaign)?.book() : undefined;
      if (found && book) return { campaign: found.campaign, book };
      // Not one of today's packages (an earlier build of the library, a package edited before it
      // was published): the book of the campaign with this name, if everything it names is there.
      const { content } = revision;
      const world = {
        places: new Set(content.entities.filter((e) => e.kind === 'location').map((e) => e.key)),
        people: new Set(content.entities.map((e) => e.key)),
        clues: new Set(content.clues.map((c) => c.key)),
        encounters: new Set(content.encounters.map((e) => e.key)),
      };
      for (const [campaign, loaded] of campaigns) {
        // The name first: only that campaign's book is read into its shape.
        const named = loaded.file.title === content.world.name ? loaded.book() : null;
        if (named && bookReferenceProblems(named, world).length === 0)
          return { campaign, book: named };
      }
      return null;
    },
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
