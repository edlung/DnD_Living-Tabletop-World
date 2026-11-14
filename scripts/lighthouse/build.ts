import { mkdir, writeFile } from 'node:fs/promises';

import { HERO_KEYS } from './data.ts';
import { buildLighthousePackage } from './package.ts';
import { validateLighthouse } from './validate.ts';

const content = buildLighthousePackage();
const result = await validateLighthouse(content);
if (result.assessment.readiness !== 'READY') {
  process.stderr.write(JSON.stringify(result.assessment, null, 2));
  process.exitCode = 1;
} else {
  await writeFile(
    new URL('../../campaigns/lighthouse/package.json', import.meta.url),
    `${JSON.stringify(content, null, 2)}\n`,
  );
  process.stdout.write(
    JSON.stringify({
      readiness: result.assessment.readiness,
      ...result.assessment.counts,
      party: content.party,
      situations: content.situations.length,
      findings: result.assessment.findings,
    }),
  );
}

if (process.exitCode !== 1) {
  const directory = new URL('../../campaigns/lighthouse/variants/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const omitted of HERO_KEYS.filter((key) => key !== 'mika')) {
    const party = HERO_KEYS.filter((key) => key !== omitted);
    await writeFile(
      new URL(`without-${omitted}.json`, directory),
      `${JSON.stringify(buildLighthousePackage(party), null, 2)}\n`,
    );
  }
  await writeFile(
    new URL('four-players.json', directory),
    `${JSON.stringify(buildLighthousePackage(HERO_KEYS), null, 2)}\n`,
  );
}
