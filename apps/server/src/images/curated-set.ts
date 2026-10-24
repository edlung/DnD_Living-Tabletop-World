import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ImageGenerationError, type GeneratedImage, type ImageGenerator } from '@ltw/ai';
import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  assetLabelSchema,
  entityIdSchema,
  type AssetPurpose,
  type AssetVariant,
} from '@ltw/contracts';
import { z } from 'zod';

import { MAX_CONTENT_BYTES } from '../assets/content-store.ts';

/**
 * The curated Ravenford set (docs/adr/0035-images.md §3; fixtures/ravenford-ru/assets/): pictures
 * an OpenAI image model made once, committed with a manifest of their provenance. They reach a
 * campaign only through real commands (`curated-import.ts`); the `curated` generator serves their
 * bytes to the asset worker by entity, variant, label and purpose, and has nothing else.
 */
export const CURATED_SET_DIR = fileURLToPath(
  new URL('../../../../fixtures/ravenford-ru/assets/', import.meta.url),
);

/** The provider name recorded with every curated asset (`generator.provider`). */
export const CURATED_PROVIDER = 'curated';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const entrySchema = z
  .object({
    file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.webp$/),
    entityIds: z.array(entityIdSchema).min(1),
    variant: z.enum(ASSET_VARIANTS),
    label: assetLabelSchema.nullable(),
    purpose: z.enum(ASSET_PURPOSES),
    derivedFrom: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*\.webp$/)
      .nullable(),
    mediaType: z.literal('image/webp'),
    sha256,
    originalSha256: sha256,
    generated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    references: z.array(z.string().min(1)),
    prompt: z.string().min(1),
  })
  .strict();

const manifestSchema = z
  .object({
    about: z.string().min(1),
    generator: z.string().trim().min(1).max(100),
    assets: z.array(entrySchema).min(1),
  })
  .strict();

export type CuratedEntry = z.infer<typeof entrySchema>;

export interface CuratedSet {
  /** The model recorded with each asset: the manifest's generator. */
  readonly model: string;
  /** References first, then derived variants, each in manifest order. */
  readonly entries: readonly CuratedEntry[];
  readonly bytesOf: (file: string) => Uint8Array;
}

/** Thrown when the committed set and its manifest disagree: nothing is imported then. */
export class CuratedSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CuratedSetError';
  }
}

const keyOf = (
  entityId: string,
  variant: AssetVariant,
  label: string | null,
  purpose: AssetPurpose,
) => JSON.stringify([entityId, variant, label, purpose]);

function checkEntries(entries: readonly CuratedEntry[]): void {
  const files = new Map(entries.map((entry) => [entry.file, entry]));
  if (files.size !== entries.length) throw new CuratedSetError('a file is listed twice');
  const keys = new Set<string>();
  for (const entry of entries) {
    const reference = entry.variant === 'reference';
    if (reference !== (entry.label === null) || reference !== (entry.derivedFrom === null)) {
      throw new CuratedSetError(`${entry.file}: a reference has no label and derives from nothing`);
    }
    if (entry.purpose !== 'image' && reference) {
      throw new CuratedSetError(`${entry.file}: a ${entry.purpose} is a derived variant`);
    }
    const base = entry.derivedFrom === null ? null : files.get(entry.derivedFrom);
    if (
      entry.derivedFrom !== null &&
      (base?.variant !== 'reference' ||
        JSON.stringify(base.entityIds) !== JSON.stringify(entry.entityIds))
    ) {
      throw new CuratedSetError(`${entry.file}: derives from no reference of the same entities`);
    }
    for (const entityId of entry.entityIds) {
      const key = keyOf(entityId, entry.variant, entry.label, entry.purpose);
      if (keys.has(key)) throw new CuratedSetError(`${entry.file}: a second picture of the same`);
      keys.add(key);
    }
  }
}

/**
 * Reads and checks the manifest and every file it lists: each must match its SHA-256 and fit the
 * content limit, so that a changed or retouched file is never imported.
 */
export async function loadCuratedSet(directory: string = CURATED_SET_DIR): Promise<CuratedSet> {
  const parsed = manifestSchema.safeParse(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
  );
  if (!parsed.success) throw new CuratedSetError('the manifest does not match its schema');
  const manifest = parsed.data;
  checkEntries(manifest.assets);
  const bytes = new Map<string, Uint8Array>();
  for (const entry of manifest.assets) {
    const data = new Uint8Array(await readFile(join(directory, entry.file)));
    if (data.byteLength === 0 || data.byteLength > MAX_CONTENT_BYTES) {
      throw new CuratedSetError(`${entry.file}: outside the content limit`);
    }
    if (createHash('sha256').update(data).digest('hex') !== entry.sha256) {
      throw new CuratedSetError(`${entry.file}: does not match its SHA-256`);
    }
    bytes.set(entry.file, data);
  }
  const order = (entry: CuratedEntry) => (entry.variant === 'reference' ? 0 : 1);
  return {
    model: manifest.generator,
    entries: [...manifest.assets].sort((a, b) => order(a) - order(b)),
    bytesOf: (file) => {
      const data = bytes.get(file);
      if (!data) throw new CuratedSetError(`${file}: not in the set`);
      return data.slice();
    },
  };
}

/**
 * The `curated` generator: the committed picture for the brief's entity, variant, label and
 * purpose. Anything the set does not hold fails as `UNAVAILABLE`; it never makes an image.
 */
export function createCuratedImageGenerator(set: CuratedSet): ImageGenerator {
  const byKey = new Map<string, CuratedEntry>();
  for (const entry of set.entries) {
    for (const entityId of entry.entityIds) {
      byKey.set(keyOf(entityId, entry.variant, entry.label, entry.purpose), entry);
    }
  }
  return {
    id: CURATED_PROVIDER,
    generate: (brief): Promise<GeneratedImage> => {
      const entry = byKey.get(
        keyOf(brief.subject.entityId, brief.variant, brief.label, brief.purpose),
      );
      try {
        if (!entry) throw new ImageGenerationError('UNAVAILABLE', 'no such curated picture');
        return Promise.resolve({
          bytes: set.bytesOf(entry.file),
          mediaType: entry.mediaType,
          model: set.model,
        });
      } catch (error) {
        return Promise.reject(
          error instanceof ImageGenerationError
            ? error
            : new ImageGenerationError('UNAVAILABLE', 'the curated picture is unreadable'),
        );
      }
    },
  };
}
