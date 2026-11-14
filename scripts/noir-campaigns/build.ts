import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { buildPackage } from './package.ts';
import { validatePackage } from './validate.ts';

async function sourceDigest(slug: string): Promise<string> {
  const root = new URL(`${slug}/source/`, COLLECTION_ROOT);
  const hash = createHash('sha256');
  for (const name of (await readdir(root)).filter((x) => x.endsWith('.json')).sort()) {
    hash
      .update(name)
      .update('\0')
      .update(await readFile(new URL(name, root)))
      .update('\0');
  }
  return hash.digest('hex');
}

const selected = process.argv.slice(2);
for (const slug of selected.length ? selected : SLUGS) {
  const sourceSha256 = await sourceDigest(slug);
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
  if (sourceSha256 !== (await sourceDigest(slug)))
    throw new Error(`${slug}: source changed during build; retry after author finishes`);
  await mkdir(new URL(`${slug}/variants/`, COLLECTION_ROOT), { recursive: true });
  await writeFile(
    new URL(`${slug}/variants/AGENTS.md`, COLLECTION_ROOT),
    '# Generated native party variants\n\nRebuild through scripts/noir-campaigns/build.ts. Read by key; never hand-edit or load all variants.\nDM-private preparation includes secrets. These files do not activate a live campaign.\n',
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
        sourceSha256,
        sourceHashAlgorithm: 'sorted source JSON filename + NUL + exact bytes + NUL',
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
