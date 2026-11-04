import { PassThrough, Readable } from 'node:stream';

import type pg from 'pg';

import { exportCampaign, type ExportOptions } from '../campaigns/move/export.ts';
import { importCampaign, type ImportReport } from '../campaigns/move/import.ts';
import { PackageWriter, packageHeaderSchema } from '../campaigns/move/package.ts';

/**
 * Integration-test support for campaign moves (excluded from builds): a package as the bytes the
 * CLI would gunzip, imported from bytes, and rewritten line by line with a fresh valid digest, so a
 * test can hand an import a package that is whole but wrong in one way.
 */
export async function pack(
  pool: pg.Pool,
  options: Pick<ExportOptions, 'move'> & Partial<ExportOptions>,
): Promise<Buffer> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (chunk: Buffer) => chunks.push(chunk));
  await exportCampaign(
    pool,
    'ravenford',
    { source: 'https://source.example', settleMs: 5_000, ...options },
    out,
  );
  out.end();
  return Buffer.concat(chunks);
}

export function bring(pool: pg.Pool, bytes: Buffer): Promise<ImportReport> {
  return importCampaign(pool, Readable.from([bytes]));
}

/** A row line from a row's columns. */
export const row = (columns: Record<string, unknown>) => `R ${JSON.stringify(columns)}`;

/** The package with each line but the end passed through `change`, and a new end. */
export async function rewrite(bytes: Buffer, change: (line: string) => string): Promise<Buffer> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (chunk: Buffer) => chunks.push(chunk));
  const writer = new PackageWriter(out);
  for (const line of bytes.toString('utf8').split('\n')) {
    if (line === '' || line.startsWith('Z ')) continue;
    const changed = change(line);
    const body = changed.slice(2);
    if (changed.startsWith('H ')) await writer.header(packageHeaderSchema.parse(JSON.parse(body)));
    else if (changed.startsWith('T ')) {
      const table = JSON.parse(body) as { name: string; columns: string[] };
      await writer.table(table.name, table.columns);
    } else if (changed.startsWith('R ')) await writer.row(body);
    else {
      const end = JSON.parse(body) as { name: string; rows: number };
      await writer.end(end.name, end.rows);
    }
  }
  await writer.finish();
  out.end();
  return Buffer.concat(chunks);
}
