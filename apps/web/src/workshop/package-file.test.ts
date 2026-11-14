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
  expect(parsePackageFile(' '.repeat(512 * 1024 + 1))).toBeNull();
  expect(
    parsePackageFile(JSON.stringify({ ...bellCampaign(), extra: 'я'.repeat(270000) })),
  ).toBeNull();
});
