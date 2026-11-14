import { writeFile } from 'node:fs/promises';
import { SLUGS, loadSource } from './source.ts';

const selected = process.argv.slice(2);
const references = new Set([
  'key',
  'slug',
  'startLocation',
  'location',
  'parent',
  'subjects',
  'clues',
  'participants',
  'handouts',
  'witnesses',
  'npc',
  'culprit',
  'archetype',
  'status',
  'weather',
]);
const findings: { slug: string; field: string; key: string }[] = [];
for (const slug of selected.length ? selected : SLUGS) {
  const s = await loadSource(slug);
  const keys = [
    ...s.world.locations,
    ...s.cast.heroes,
    ...s.cast.npcs,
    ...s.clues,
    ...s.handouts,
    ...s.encounters,
  ]
    .map((x) => x.key)
    .filter((key) => key.includes('-'));
  function inspect(value: unknown, path: string, field = '') {
    if (references.has(field)) return;
    if (typeof value === 'string') {
      for (const key of keys) if (value.includes(key)) findings.push({ slug, field: path, key });
    } else if (Array.isArray(value))
      value.forEach((x, i) => {
        inspect(x, `${path}.${i}`, field);
      });
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([k, v]) => {
        inspect(v, `${path}.${k}`, k);
      });
  }
  inspect(s, 'source');
}
const name = selected.length ? `prose-${selected.join('-')}.json` : 'prose-audit.json';
await writeFile(
  new URL(`../../reports/evidence/noir-ten-2026-11-08/${name}`, import.meta.url),
  `${JSON.stringify(findings, null, 2)}\n`,
);
process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
if (findings.length) process.exitCode = 1;
