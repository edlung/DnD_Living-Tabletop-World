import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { buildPackage } from './package.ts';
import { validatePackage } from './validate.ts';

const selected = process.argv.slice(2);
for (const slug of selected.length ? selected : SLUGS) {
  const source = await loadSource(slug);
  const sourceNames = [
    'world',
    'cast',
    'clues',
    'handouts',
    'encounters',
    'sessions-1',
    'sessions-2',
    'sessions-3',
    'sessions-4',
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sourceNames.map(
        async (name) =>
          [
            `source/${name}.json`,
            createHash('sha256')
              .update(await readFile(new URL(`${slug}/source/${name}.json`, COLLECTION_ROOT)))
              .digest('hex'),
          ] as const,
      ),
    ),
  );
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
        providerResponseAttestation:
          'NOT_AVAILABLE; agent launch configuration is recorded separately',
        humanPlaytest: 'NOT_RUN',
        validation: 'isolated canonical compiler; no database or real activation',
        counts: {
          sessions: source.sessions.length,
          scenes: source.sessions.reduce((n, session) => n + session.scenes.length, 0),
          heroes: source.cast.heroes.length,
          npcs: source.cast.npcs.length,
          locations: source.world.locations.length,
          clues: source.clues.length,
          handouts: source.handouts.length,
          encounters: source.encounters.length,
        },
        sourceHashes,
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
