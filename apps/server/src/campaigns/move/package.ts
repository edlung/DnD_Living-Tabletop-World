import { createHash, type Hash } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import { z } from 'zod';

/**
 * A campaign's package (docs/adr/0061-local-mode.md §6): lines of text, gzip-compressed on the way
 * (the CLI's). Each line opens with its tag and a space:
 * - `H` the header (once, first);
 * - `T` a table and the columns of its rows; `R` one row (PostgreSQL's `row_to_json`, as it is);
 *   `E` the table's end with its row count;
 * - `Z` the end: the rows in all and the SHA-256 of every byte before this line.
 * A reader trusts nothing it has not checked: an import commits only after the end's digest.
 */
export const PACKAGE_FORMAT = 'ltw-campaign';
export const PACKAGE_VERSION = 1;

const campaignIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const identifierSchema = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);

export const packageHeaderSchema = z
  .object({
    format: z.literal(PACKAGE_FORMAT),
    version: z.literal(PACKAGE_VERSION),
    campaign: campaignIdSchema,
    /** The source's newest migration: the target must have every table and column it names. */
    schema: z.string().min(1).max(120),
    /** The source, as its operator named it (its public origin). */
    source: z.string().min(1).max(200),
    exportedAt: z.iso.datetime({ offset: true }),
    /** A move: the campaign is away on its source until it comes back. Null for a copy. */
    move: z
      .object({ destination: z.string().min(1).max(80) })
      .strict()
      .nullable(),
  })
  .strict();
export type PackageHeader = z.infer<typeof packageHeaderSchema>;

const tableLineSchema = z
  .object({ name: identifierSchema, columns: z.array(identifierSchema).min(1).max(200) })
  .strict();
const endLineSchema = z
  .object({ name: identifierSchema, rows: z.number().int().nonnegative() })
  .strict();
const trailerSchema = z
  .object({ rows: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();

export class PackageError extends Error {}

/** Writes a package's lines to `out`, keeping the digest; waits when `out` is full. */
export class PackageWriter {
  readonly #out: Writable;
  readonly #hash: Hash = createHash('sha256');
  #rows = 0;

  constructor(out: Writable) {
    this.#out = out;
  }

  async header(header: PackageHeader): Promise<void> {
    await this.#line('H', JSON.stringify(header));
  }

  async table(name: string, columns: readonly string[]): Promise<void> {
    await this.#line('T', JSON.stringify({ name, columns }));
  }

  /** A row as PostgreSQL wrote it (one line of JSON). */
  async row(json: string): Promise<void> {
    if (json.includes('\n')) throw new PackageError('a row spans lines');
    this.#rows += 1;
    await this.#line('R', json);
  }

  async end(name: string, rows: number): Promise<void> {
    await this.#line('E', JSON.stringify({ name, rows }));
  }

  /** The end line; returns the digest. */
  async finish(): Promise<string> {
    const sha256 = this.#hash.digest('hex');
    await this.#write(`Z ${JSON.stringify({ rows: this.#rows, sha256 })}\n`);
    return sha256;
  }

  async #line(tag: string, body: string): Promise<void> {
    const line = `${tag} ${body}\n`;
    this.#hash.update(line);
    await this.#write(line);
  }

  #write(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        reject(error);
      };
      this.#out.once('error', onError);
      const done = () => {
        this.#out.off('error', onError);
        resolve();
      };
      if (this.#out.write(text)) done();
      else this.#out.once('drain', done);
    });
  }
}

/** One line of a package, checked (rows stay as their text: PostgreSQL parses them). */
export type PackageLine =
  | { readonly kind: 'table'; readonly name: string; readonly columns: readonly string[] }
  | { readonly kind: 'row'; readonly json: string; readonly bytes: number }
  | { readonly kind: 'end'; readonly name: string; readonly rows: number };

/**
 * Reads a package: the header first, then its lines; the last call checks the end line's digest
 * and count against what was read and throws on any mismatch, a line out of place or a line after
 * the end. A row is only checked to be one JSON object's text here.
 */
export async function* readPackage(
  input: Readable,
  onHeader: (header: PackageHeader) => void | Promise<void>,
): AsyncGenerator<PackageLine, void, undefined> {
  const hash = createHash('sha256');
  const lines = createInterface({ input, crlfDelay: Infinity });
  let header = false;
  let open: string | null = null;
  let finished = false;
  let rows = 0;
  for await (const line of lines) {
    if (finished) throw new PackageError('a line after the end');
    const tag = line.slice(0, 2);
    const body = line.slice(2);
    if (tag === 'Z ') {
      if (!header || open !== null) throw new PackageError('the end comes too early');
      const trailer = parse(trailerSchema, body, 'the end');
      if (trailer.sha256 !== hash.digest('hex'))
        throw new PackageError('the digest does not match');
      if (trailer.rows !== rows) throw new PackageError('the row count does not match');
      finished = true;
      continue;
    }
    hash.update(`${line}\n`);
    if (!header) {
      if (tag !== 'H ') throw new PackageError('not a campaign package');
      await onHeader(parse(packageHeaderSchema, body, 'the header'));
      header = true;
    } else if (tag === 'T ') {
      if (open !== null) throw new PackageError(`table ${open} has no end`);
      const table = parse(tableLineSchema, body, 'a table');
      open = table.name;
      yield { kind: 'table', name: table.name, columns: table.columns };
    } else if (tag === 'R ') {
      if (open === null || !body.startsWith('{') || !body.endsWith('}')) {
        throw new PackageError('a row out of place');
      }
      rows += 1;
      yield { kind: 'row', json: body, bytes: body.length };
    } else if (tag === 'E ') {
      const end = parse(endLineSchema, body, 'a table end');
      if (end.name !== open) throw new PackageError(`table ${end.name} ends unopened`);
      open = null;
      yield { kind: 'end', name: end.name, rows: end.rows };
    } else {
      throw new PackageError('an unknown line');
    }
  }
  if (!finished) throw new PackageError('the package is cut short');
}

function parse<T>(schema: z.ZodType<T>, body: string, what: string): T {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new PackageError(`${what} is not JSON`);
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new PackageError(`${what} is not valid`);
  return result.data;
}
