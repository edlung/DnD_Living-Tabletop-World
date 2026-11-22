import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { slugs, read } from '../campaign-balance/scenes.mjs';
import { histories } from './choices.mjs';
import { snapshot } from './resources.mjs';
import { loadJourney, play } from './journey.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    seeds: { type: 'string', default: '32' },
    start: { type: 'string', default: '0' },
    edition: { type: 'string' },
    history: { type: 'string' },
    itineraries: { type: 'string', default: 'scripts/campaign-endurance/itineraries.json' },
  },
});
const count = Number(values.seeds),
  start = Number(values.start);
assert.ok(
  values.out &&
    Number.isSafeInteger(count) &&
    count > 0 &&
    Number.isSafeInteger(start) &&
    start >= 0,
);
mkdirSync(values.out, { recursive: true });
const routes = {
  ...read('scripts/campaign-endurance/itineraries.json'),
  ...read(values.itineraries),
};
assert.deepEqual(Object.keys(routes).sort(), slugs);

for (const slug of positionals.length ? positionals : slugs) {
  const route = routes[slug];
  const { variants, book, levelByChapter } = await loadJourney(slug, route, values.edition);
  const runs = [],
    special = [];
  for (const group of variants.values()) {
    const profiles = Object.keys(histories[slug] ?? { route: null }).filter(
      (p) => !values.history || p === values.history,
    );
    assert.ok(profiles.length);
    for (const profile of profiles)
      for (let seed = start; seed < start + count; seed++) {
        try {
          const run = play(slug, group, profile, seed, levelByChapter, route, book);
          if (run.special) special.push(run.special);
          delete run.special;
          runs.push(run);
        } catch (error) {
          throw Error([slug, group[0].variant, profile, seed].join('/'), { cause: error });
        }
      }
  }
  writeFileSync(
    join(values.out, slug + '.book.json'),
    JSON.stringify({
      slug,
      chapters: book.chapters,
      decision: book.decision,
      encounters: route.chapters,
      rests: route.rests,
      histories: histories[slug] ?? { route: 'Основной маршрут' },
      parties: Object.fromEntries(
        [...variants].map(([id, v]) => [
          id,
          snapshot(v[0].state, v[0]).party.map((h) => ({
            seat: h.seat,
            key: h.key,
            name: h.name,
            class: h.class,
          })),
        ]),
      ),
    }) + '\n',
  );
  const encode = (rows) =>
    gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), {
      level: 3,
    });
  writeFileSync(join(values.out, slug + '.jsonl.gz'), encode(runs));
  if (histories[slug]) writeFileSync(join(values.out, slug + '.entries.gz'), encode(special));
  process.stdout.write(
    [slug, runs.length, runs.filter((r) => r.terminal === 'stopped').length, special.length].join(
      ' ',
    ) + '\n',
  );
}
