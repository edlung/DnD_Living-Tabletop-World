import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (...parts) => JSON.parse(readFileSync(join(...parts), 'utf8'));
const campaignRoot = join(ROOT, 'campaigns');
const shelves = readdirSync(campaignRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(campaignRoot, d.name));
const builtin = {
  ravenford: [['Дело о пропавшем караване', 'location-f3b82c8b']],
  hollowmere: [
    ['Повозка вдовы', 'reeves-hall'],
    ['Колокольня и часовня', 'bell-tower'],
    ['Мельница', 'sunken-mill'],
    ['Поиски под часовней', 'location-5b2e9c47'],
  ],
};
export function books() {
  const result = new Map();
  for (const shelf of shelves) {
    const candidates = existsSync(join(shelf, 'source', 'world.json'))
      ? [shelf]
      : readdirSync(shelf, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => join(shelf, d.name));
    for (const path of candidates) {
      const folder = join(path, 'source');
      if (!existsSync(join(folder, 'world.json'))) continue;
      const slug = path.split('/').at(-1),
        world = read(folder, 'world.json'),
        profile = read(folder, 'table-routes.json');
      const chapters = readdirSync(folder)
        .filter((n) => /^(act|sessions)-\d+\.json$/.test(n))
        .flatMap((n) => read(folder, n))
        .sort((a, b) => a.number - b.number);
      assert.deepEqual(
        profile.chapters.map((c) => c.number),
        chapters.map((c) => c.number),
        slug,
      );
      result.set(slug, { slug, title: world.title, profile, chapters, folder });
    }
  }
  for (const [slug, rows] of Object.entries(builtin)) {
    const profile = read(ROOT, 'scripts/campaign-rehearsal/builtins', slug + '.json');
    result.set(slug, {
      slug,
      title: slug === 'hollowmere' ? 'Колокола Холлоумира' : 'Равенфорд',
      profile,
      chapters: rows.map(([title, location], i) => ({ title, location, number: i + 1 })),
    });
  }
  const shelf = readdirSync(join(ROOT, 'fixtures/campaign-library'), { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(join(ROOT, 'fixtures/campaign-library', d.name, 'library.json')),
    )
    .map((d) => d.name);
  assert.deepEqual([...result.keys()].sort(), [...shelf, ...Object.keys(builtin)].sort());
  return result;
}
