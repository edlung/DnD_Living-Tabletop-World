import { expect, it } from 'vitest';
import { bellCampaign } from '../../../../packages/domain/src/campaign/testing/bell.ts';
import { parsePackageFile } from './package-file.ts';

it('accepts only package content, never server identities or provenance', () => {
  const content = bellCampaign();
  expect(parsePackageFile(JSON.stringify(content))).toEqual(content);
  expect(
    parsePackageFile(JSON.stringify({ ...content, source: { kind: 'AI', provider: 'forged' } })),
  ).toBeNull();
  expect(parsePackageFile(JSON.stringify({ content, identities: {} }))).toBeNull();
  expect(parsePackageFile('{broken')).toBeNull();
});
it('limits UTF-8 bytes rather than JavaScript string length', () => {
  expect(parsePackageFile(' '.repeat(2 * 1024 * 1024 + 1))).toBeNull();
  expect(
    parsePackageFile(JSON.stringify({ ...bellCampaign(), extra: 'я'.repeat(270000) })),
  ).toBeNull();
});
it('measures the content the server receives, not the file’s indentation', () => {
  const content = bellCampaign();
  // A real authored package with long texts: pretty-printed over 512 KiB, compact under it.
  const padded = `${JSON.stringify(content, null, 2)}${' '.repeat(600 * 1024)}`;
  expect(new TextEncoder().encode(padded).byteLength).toBeGreaterThan(512 * 1024);
  expect(parsePackageFile(padded)).toEqual(content);
});
