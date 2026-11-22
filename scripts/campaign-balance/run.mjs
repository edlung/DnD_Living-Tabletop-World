import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { scenes, slugs } from './scenes.mjs';
import { battle } from './battle.mjs';
import { specialistKeys } from './expeditions.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seeds: { type: 'string', default: '24' },
    start: { type: 'string', default: '0' },
    out: { type: 'string' },
    'full-opposition': { type: 'boolean', default: false },
    encounter: { type: 'string' },
    edition: { type: 'string' },
    mode: { type: 'string', default: 'book' },
  },
});
const count = Number(values.seeds),
  start = Number(values.start);
assert.ok(Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(start) && start >= 0);
assert.ok(['book', 'pressure'].includes(values.mode));
if (values.out) mkdirSync(values.out, { recursive: true });
const add = (dst, src) => {
  for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] ?? 0) + v;
};
for (const slug of positionals.length ? positionals : slugs) {
  assert.ok(slugs.includes(slug), slug);
  const rows = [];
  for await (const s of scenes(slug, !values['full-opposition'])) {
    if (values.mode === 'book' && specialistKeys.has(s.key)) continue;
    if (
      (values.encounter && values.encounter !== s.key) ||
      (values.edition && s.variant !== values.edition)
    )
      continue;
    const row = {
      key: s.key,
      title: s.title,
      edition: s.variant,
      party: s.party.map((k) => {
        const c = s.state.characterSheets.get(k);
        return [
          s.state.entities.get(k).name,
          c.classes.map((c) => c.classId + ' ' + c.level).join('/'),
        ];
      }),
      foes: s.foes.length,
      trials: count,
      results: {},
      rounds: 0,
      down: 0,
      zero: 0,
      hp: 0,
      dice: {},
      stats: {},
    };
    for (let i = start; i < start + count; i++) {
      const o = battle(s, [s.slug, s.variant, s.key, i].join('/'), { mode: values.mode });
      add(row.results, { [o.outcome]: 1 });
      row.rounds += o.round;
      row.down += o.down;
      row.zero += o.down > 0 ? 1 : 0;
      row.hp += o.hp;
      add(row.dice, o.dice);
      add(row.stats, o.stats);
    }
    rows.push(row);
  }
  if (values.out)
    writeFileSync(
      values.out + '/' + slug + '.json',
      JSON.stringify({ slug, start, count, mode: values.mode, rows }) + '\n',
    );
  const totals = {};
  for (const r of rows) add(totals, r.results);
  process.stdout.write(`${slug} ${rows.length} ${JSON.stringify(totals)}\n`);
}
