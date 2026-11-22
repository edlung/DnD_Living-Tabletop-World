/** Add cropped figures to a native adventure's curated set, retaining the original manifest text
 * for all earlier entries, including its provenance. Run after prepare-table-art.mjs. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const dir = new URL('../../fixtures/hollowmere/assets/', import.meta.url);
const manifestFile = new URL('manifest.json', dir);
const original = await readFile(manifestFile, 'utf8');
let updated = original;
const { assets } = JSON.parse(original);
const table = JSON.parse(await readFile(new URL('table/manifest.json', dir), 'utf8'));
const additions = [];
// The curated manifest keeps its small arrays of subject and reference names on one line.
const block = (row) => {
  const fields = Object.entries(row).map(([key, value]) => {
    const text = Array.isArray(value)
      ? '[' + value.map((part) => JSON.stringify(part)).join(', ') + ']'
      : JSON.stringify(value);
    return '      ' + JSON.stringify(key) + ': ' + text;
  });
  return '    {\n' + fields.join(',\n') + '\n    }';
};
for (const row of table.pictures.filter((p) => p.kind === 'npc')) {
  const file = basename(row.file);
  const image = await readFile(new URL(file, dir));
  if (createHash('sha256').update(image).digest('hex') !== row.sha256)
    throw Error('Figure changed: ' + file);
  const present = assets.find((a) => a.file === file);
  if (present) {
    if (present.sha256 !== row.sha256) {
      const old = block(present);
      if (
        present.originalSha256 !== row.originalSha256 ||
        present.purpose !== 'figure' ||
        !updated.includes(old)
      )
        throw Error('Existing curated figure differs: ' + file);
      updated = updated.replace(old, block({ ...present, sha256: row.sha256 }));
    }
    continue;
  }
  const base = assets.find((a) => a.variant === 'reference' && a.entityIds.includes(row.key));
  if (!base) throw Error('Missing portrait: ' + row.key);
  const source = table.sheets.find((s) => s.id === row.sheet);
  additions.push({
    file,
    entityIds: row.subjects,
    variant: 'derived',
    label: 'figure',
    purpose: 'figure',
    derivedFrom: base.file,
    mediaType: 'image/webp',
    sha256: row.sha256,
    originalSha256: row.originalSha256,
    generated: row.generated,
    references: [base.file],
    prompt:
      'Painted tabletop figure of ' +
      row.title +
      '. Reference sheet ' +
      source.id +
      '. Cell ' +
      row.cell +
      '.',
  });
}
if (additions.length) {
  const end = updated.lastIndexOf('\n  ]');
  if (end < 0) throw Error('Unexpected curated set layout');
  updated = updated.slice(0, end) + ',\n' + additions.map(block).join(',\n') + updated.slice(end);
}
if (updated !== original) await writeFile(manifestFile, updated);
