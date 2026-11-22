import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { remainingCryptTurns, resolveAftermath } from './aftermath.mjs';
import { read } from '../campaign-balance/scenes.mjs';
import { loadJourney, play } from '../campaign-endurance/journey.mjs';
import { tacticsFor } from './tactics.mjs';
import { snapshot } from '../campaign-endurance/resources.mjs';

const cases = JSON.parse(
  execFileSync('python3', ['scripts/campaign-defeats/cohort.py'], { maxBuffer: 16 * 1024 * 1024 }),
);
const routes = read('scripts/campaign-endurance/itineraries.json');
const out = process.argv[2];
assert.ok(out, 'directory for replay evidence');
mkdirSync(out, { recursive: true });
const plain = (v) => JSON.parse(JSON.stringify(v));
const fingerprint = (v) =>
  createHash('sha256')
    .update(
      JSON.stringify(v, (_, x) =>
        x instanceof Map ? [...x.entries()] : x instanceof Set ? [...x] : x,
      ),
    )
    .digest('hex');
const replayed = [];
const stairs = [];
for (const slug of [...new Set(cases.map((c) => c.slug))]) {
  const route = routes[slug],
    { variants, levelByChapter, book } = await loadJourney(slug, route);
  for (const { series, pivot, run: archived } of cases.filter((c) => c.slug === slug)) {
    const { edition, profile, seed } = archived,
      group = variants.get(edition);
    function simulate(policy, fork = pivot) {
      const index = archived.steps.findIndex((s) => s.key === fork && s.outcome);
      const journal = { policy },
        dice = [],
        actions = [];
      let phase = 'battle',
        previousHp,
        ledger;
      const restored = play(slug, group, profile, seed, levelByChapter, route, book, {
        restoreArchive: true,
        encounter(s, entry, steps) {
          if (s.key !== fork) {
            if (policy === 'followup' && journal.start && s.key === 'marsh-lights')
              return { tactics: tacticsFor('alternative') };
            return;
          }
          assert.deepEqual(plain(steps), archived.steps.slice(0, index));
          journal.start = fingerprint([s.state, s.start, s.stores]);
          journal.entry = entry;
          journal.stores = { ...s.stores };
          s.observeDie = (sides, face) => dice.push([sides, face]);
          s.observeCommand = (a, cmd, events) => {
            const hp = group[0].party.map((k) => a.state.characterSheets.get(k).hitPoints.current);
            actions.push({
              phase,
              r: a.board?.round,
              ...cmd,
              events: events.map((e) => e.type),
              ...(String(hp) !== String(previousHp) ? { hp } : {}),
              diceTo: dice.length,
            });
            previousHp = hp;
          };
          return {
            resumeCurrentRules: policy !== 'original',
            tactics: tacticsFor(policy === 'followup' ? 'alternative' : policy),
          };
        },
        afterBattle(s, result) {
          if (s.key !== fork) return;
          journal.field = snapshot(result.arena.state, group[0]);
          if (policy === 'original' && pivot === 'niche-guards')
            journal.clock = remainingCryptTurns(result.arena, (state) => snapshot(state, group[0]));
          phase = 'care';
        },
        afterCare(s, a) {
          if (s.key === fork) journal.afterCare = snapshot(a.state, group[0]);
        },
        finish(state, first, story) {
          journal.final = snapshot(state, first);
          ledger = story;
        },
      });
      const { special, ...run } = restored;
      assert.deepEqual(plain(run.steps.slice(0, index)), archived.steps.slice(0, index));
      assert.deepEqual(plain(run.steps[index].entry), archived.steps[index].entry);
      if (policy === 'original') assert.deepEqual(plain(run), archived);
      journal.run = plain(run);
      journal.special = special;
      journal.dice = dice;
      journal.actions = actions;
      journal.after = resolveAftermath(
        { slug, edition, profile, seed, run: archived },
        journal,
        group[0],
      );
      if (journal.after.kind === 'guests') {
        // The guests let the garden door close, conserve their existing lights
        // by the route's normal evening-five schedule, and try the final stair.
        ledger.chapter(5, true);
        journal.special = {
          edition,
          profile,
          seed,
          key: 'six-strokes',
          entry: journal.clock.entry,
          taken: journal.after.taken.map((n) => group[0].heroKeys[n - 1]),
          stores: { ...ledger.stores },
          previous: run.steps
            .filter((x) => x.outcome || x.skip)
            .map((x) => [x.key, x.outcome ?? 'bypass']),
        };
      }
      if (journal.special) stairs.push(journal);
      return journal;
    }
    const runs = Object.fromEntries(
      ['original', 'control', 'pressure', 'alternative'].map((p) => [p, simulate(p)]),
    );
    assert.equal(new Set(Object.values(runs).map((r) => r.start)).size, 1);
    if (pivot === 'drowned-chapel') runs.followup = simulate('followup');
    if (
      pivot === 'sunken-bell' &&
      runs.original.actions.every(
        (c) => !group[0].party.includes(c.combatantId) && !group[0].party.includes(c.characterId),
      )
    )
      runs.followup = simulate('followup', 'flooded-stair');
    replayed.push({ series, slug, pivot, edition, profile, seed, ...runs });
  }
}
const encode = (rows) => gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
if (stairs.length) {
  writeFileSync(join(out, 'hollow-choir.entries.gz'), encode(stairs.map((j) => j.special)));
  execFileSync('python3', ['scripts/campaign-endurance/special.py', out, 'hollow-choir'], {
    env: { ...process.env, PYTHONHASHSEED: '0', PYTHONDONTWRITEBYTECODE: '1' },
  });
  const finals = gunzipSync(readFileSync(join(out, 'hollow-choir.finales.gz')))
    .toString()
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x));
  assert.equal(finals.length, stairs.length);
  for (const [i, j] of stairs.entries()) {
    const f = finals[i];
    assert.equal(f.seed, j.special.seed);
    assert.equal(f.edition, j.special.edition);
    assert.equal(f.profile, j.special.profile);
    j.after.finale = f;
    j.after.line =
      (j.after.kind === 'guests' ? 'Гости подошли к лестнице. ' : '') +
      f.outcome +
      '. Через ворота вышли ' +
      f.details.escaped +
      ' из ' +
      (j.final.party.length + 7) +
      '.';
    if (f.details.escaped === 0)
      j.after.line +=
        ' У моста последний забранный поднимает фонарь Гаспара и приглашает путников на ночлег.';
  }
}
writeFileSync(
  join(out, 'replays.jsonl.gz'),
  gzipSync(replayed.map((r) => JSON.stringify(r)).join('\n') + '\n'),
);
process.stdout.write(`Reproduced ${replayed.length} archived expeditions\n`);
