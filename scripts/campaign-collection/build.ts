import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { buildPackage } from './package.ts';
import { validatePackage } from './validate.ts';

const selected = process.argv.slice(2);
for (const slug of selected.length ? selected : SLUGS) {
  const source = await loadSource(slug);
  const prepared = [];
  for (let size = source.world.minPlayers; size <= source.world.maxPlayers; size++) {
    const content = buildPackage(source, size);
    const result = await validatePackage(content);
    if (result.assessment.readiness !== 'READY')
      throw new Error(`${slug}/${size}: ${JSON.stringify(result.assessment)}`);
    const bytes = `${JSON.stringify(content, null, 2)}\n`;
    prepared.push({
      size,
      bytes,
      hash: createHash('sha256').update(bytes).digest('hex'),
      assessment: result.assessment,
    });
  }
  await mkdir(new URL(`${slug}/variants/`, COLLECTION_ROOT), { recursive: true });
  await writeFile(
    new URL(`${slug}/variants/AGENTS.md`, COLLECTION_ROOT),
    '# Generated party variants\n\nRebuild with scripts/campaign-collection/build.ts; edit source/ instead.\n' +
      'These owner-private preparation packages never execute future events or grant player control.\n',
  );
  for (const v of prepared) {
    await writeFile(new URL(`${slug}/variants/${v.size}-players.json`, COLLECTION_ROOT), v.bytes);
    if (v.size === source.world.defaultPlayers)
      await writeFile(new URL(`${slug}/package.json`, COLLECTION_ROOT), v.bytes);
  }
  await writeFile(
    new URL(`${slug}/verification.json`, COLLECTION_ROOT),
    `${JSON.stringify(
      {
        modelRequested: source.world.engine ? 'claude-opus-5-5' : 'gpt-6-astra',
        effortRequested: 'max',
        humanPlaytest: 'NOT_RUN',
        validation: 'isolated canonical compiler; no database or real activation',
        variants: prepared.map(({ size, hash, assessment }) => ({
          size,
          sha256: hash,
          ...assessment,
        })),
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`${slug}: ${prepared.length} variants READY\n`);
}
