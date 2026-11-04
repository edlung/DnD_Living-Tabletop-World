import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { parseMoveArgs } from './cli-args.ts';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  PackageWriter,
  readPackage,
  type PackageLine,
} from './package.ts';

/**
 * A campaign's package as lines (docs/adr/0061-local-mode.md §6): what a writer wrote reads back
 * with its digest checked; a changed byte, a line out of place, a cut or a line after the end is
 * refused; and the operator's command line takes exactly its forms.
 */
const HEADER = {
  format: PACKAGE_FORMAT,
  version: PACKAGE_VERSION,
  campaign: 'ravenford',
  schema: '0039_campaign_moves',
  source: 'https://ltw.example',
  exportedAt: '2026-11-04T10:00:00.000Z',
  move: { destination: 'MacBook' },
} as const;

async function written(): Promise<string> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (chunk: Buffer) => chunks.push(chunk));
  const writer = new PackageWriter(out);
  await writer.header(HEADER);
  await writer.table('ltw_dm_notes', ['campaign_id', 'note_id']);
  await writer.row('{"campaign_id":"ravenford","note_id":"a"}');
  await writer.row('{"campaign_id":"ravenford","note_id":"b"}');
  await writer.end('ltw_dm_notes', 2);
  await writer.finish();
  out.end();
  return Buffer.concat(chunks).toString('utf8');
}

async function read(text: string): Promise<{ header: unknown; lines: PackageLine[] }> {
  let header: unknown = null;
  const lines: PackageLine[] = [];
  for await (const line of readPackage(Readable.from([text]), (value) => {
    header = value;
  })) {
    lines.push(line);
  }
  return { header, lines };
}

describe('a campaign package', () => {
  it('reads back what was written, digest and counts checked', async () => {
    const { header, lines } = await read(await written());
    expect(header).toEqual(HEADER);
    expect(lines.map((line) => line.kind)).toEqual(['table', 'row', 'row', 'end']);
  });

  it('refuses a changed byte, a cut, a line out of place and a line after the end', async () => {
    const text = await written();
    await expect(read(text.replace('"b"', '"c"'))).rejects.toThrow(/digest does not match/);
    await expect(read(text.split('\n').slice(0, -2).join('\n'))).rejects.toThrow(/cut short/);
    await expect(read(text.replace('T {', 'R {'))).rejects.toThrow(/out of place/);
    await expect(read(`${text}R {}\n`)).rejects.toThrow(/after the end/);
    await expect(read(text.replace('"version":1', '"version":2'))).rejects.toThrow(/header/);
    await expect(read('PK\u0003\u0004 a zip\n')).rejects.toThrow(/not a campaign package/);
  });

  it('never writes a row across lines', async () => {
    const writer = new PackageWriter(new PassThrough());
    await expect(writer.row('{"text":"one\ntwo"}')).rejects.toThrow(/spans lines/);
  });
});

describe('the move’s command line', () => {
  it('takes its forms', () => {
    expect(parseMoveArgs(['export', '--campaign', 'c-1a2b', '--move', '--to', 'MacBook'])).toEqual({
      kind: 'export',
      campaign: 'c-1a2b',
      to: 'MacBook',
      out: null,
    });
    expect(parseMoveArgs(['export', '--campaign', 'ravenford', '--out', '/tmp/r.ltw'])).toEqual({
      kind: 'export',
      campaign: 'ravenford',
      to: null,
      out: '/tmp/r.ltw',
    });
    expect(parseMoveArgs(['import'])).toEqual({ kind: 'import', in: null });
    expect(parseMoveArgs(['status', '--campaign', 'ravenford'])).toEqual({
      kind: 'status',
      campaign: 'ravenford',
    });
    expect(parseMoveArgs(['cancel', '--campaign', 'ravenford'])).toEqual({
      kind: 'cancel',
      campaign: 'ravenford',
    });
  });

  it('refuses anything else', () => {
    for (const args of [
      [],
      ['export'],
      ['export', '--campaign', 'Bad Id'],
      ['export', '--campaign', 'ravenford', '--move'],
      ['export', '--campaign', 'ravenford', '--to', 'MacBook'],
      ['export', '--campaign', 'ravenford', '--move', '--to', ' '],
      ['import', '--campaign', 'ravenford'],
      ['status'],
      ['delete', '--campaign', 'ravenford'],
    ]) {
      expect(() => parseMoveArgs(args), args.join(' ')).toThrow();
    }
  });
});
