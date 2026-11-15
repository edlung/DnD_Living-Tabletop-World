import { mkdir, writeFile } from 'node:fs/promises';
import { DEFAULT_PARTY, HERO_KEYS } from './data.ts';
import { buildPearlPackage } from './package.ts';
import { validatePearl } from './validate.ts';

const root = new URL('../../campaigns/moon-pearl/', import.meta.url);
const variants = [
  { file: 'package.json', party: DEFAULT_PARTY },
  ...HERO_KEYS.filter((key) => key !== 'emil').map((omitted) => ({
    file: `variants/without-${omitted}.json`,
    party: HERO_KEYS.filter((key) => key !== omitted),
  })),
  { file: 'variants/four-players.json', party: HERO_KEYS },
];
const verified = [];
for (const variant of variants) {
  const content = buildPearlPackage(variant.party);
  const result = await validatePearl(content);
  if (result.assessment.readiness !== 'READY') throw new Error(JSON.stringify(result.assessment));
  verified.push({ ...variant, content });
  process.stdout.write(
    JSON.stringify({
      file: variant.file,
      readiness: result.assessment.readiness,
      ...result.assessment.counts,
      party: content.party,
      findings: result.assessment.findings,
    }) + '\n',
  );
}
await mkdir(new URL('variants/', root), { recursive: true });
for (const variant of verified)
  await writeFile(new URL(variant.file, root), `${JSON.stringify(variant.content, null, 2)}\n`);
