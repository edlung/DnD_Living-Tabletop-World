import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  englishHash as hashOf,
  translationProblem as checkTranslation,
  type Strings,
} from '../../packages/rules/src/srd/russian.ts';
import { DATASETS, type Unit } from './translation-units.ts';

/**
 * The Russian rules text (docs/adr/0055-rules-reference-and-toolbox.md §5). Each SRD entry is a
 * unit of strings; a unit whose English has no current Russian (a hash of the English) is asked of
 * the Codex CLI on the owner's ChatGPT subscription, in batches, against the terms glossary. A
 * Russian is kept only when it holds its English's shape, numbers and dice; the rest is asked
 * again, alone, and else left for the next run. Results are written after every batch, so a run
 * stopped part way keeps what it made.
 *
 *   node scripts/srd/translate.ts <dataset> [--batch 8000] [--parallel 3] [--limit 0]
 */
interface Kept {
  readonly hash: string;
  readonly ru: Strings;
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const outFile = (dataset: string) => join(root, 'packages/rules/src/srd/ru', `${dataset}.json`);
const terms = JSON.parse(
  readFileSync(join(root, 'packages/rules/src/srd/ru/terms.json'), 'utf8'),
) as {
  en: string;
  ru: string;
}[];

const args = process.argv.slice(2);
const dataset = args[0] ?? '';
const option = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : Number(args[at + 1]);
};
const BATCH_CHARS = option('batch', 8000);
const PARALLEL = option('parallel', 3);
const LIMIT = option('limit', 0);

const units = DATASETS[dataset];
if (!units) {
  process.stderr.write(
    `usage: node scripts/srd/translate.ts <${Object.keys(DATASETS).join('|')}>\n`,
  );
  process.exit(1);
}

const kept: Record<string, Kept> = existsSync(outFile(dataset))
  ? (JSON.parse(readFileSync(outFile(dataset), 'utf8')) as Record<string, Kept>)
  : {};
const all = units();
const waiting = all.filter((unit) => kept[unit.key]?.hash !== hashOf(unit.english));
const todo = LIMIT > 0 ? waiting.slice(0, LIMIT) : waiting;
process.stdout.write(
  `${dataset}: ${String(all.length)} units, ${String(waiting.length)} to translate\n`,
);

const save = () => {
  const ordered = Object.fromEntries(
    all.flatMap((unit) => (kept[unit.key] ? [[unit.key, kept[unit.key]]] : [])),
  );
  writeFileSync(outFile(dataset), `${JSON.stringify(ordered, null, 1)}\n`);
};

const PROMPT = `You translate the rules text of the D&D System Reference Document 5.2.1 (CC-BY-4.0) from English into Russian for a Russian-language tabletop app.

Rules:
1. The input is a JSON object: each key is an entry's id, each value an object or array of English strings. Return ONLY a JSON object with exactly the same keys and exactly the same structure (same object keys, same array lengths, same nesting), every English string replaced by its Russian translation. Never translate keys. An empty string stays empty.
2. Keep every number exactly. Keep dice notation exactly as written with a Latin "d" (2d6, 1d10 + 2, d20). Write "DC 15" as "Сл 15". Keep "+1", "+2" and the like.
3. Use these terms (English → Russian) consistently:
${terms.map((term) => `- ${term.en} → ${term.ru}`).join('\n')}
4. Write natural, precise Russian rules language, as in the Russian 5e rulebooks; address the reader as «вы» (lower case). Do not add, drop or explain anything. Names of spells, monsters and magic items are translated (the Russian name as Russian books would give it); proper names of persons stay transliterated.
5. Output the JSON only: no comments, no code fences.`;

function codex(input: Record<string, Strings>): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), 'ltw-translate-'));
  const out = join(dir, 'answer.txt');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '-s',
        'read-only',
        '-C',
        dir,
        '-c',
        'model_reasoning_effort="low"',
        '-o',
        out,
        '-',
      ],
      {
        env: { ...process.env, CODEX_HOME: join(homedir(), '.codex-review-cli') },
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    );
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => {
      errors += chunk.toString();
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const text = readFileSync(out, 'utf8')
          .trim()
          .replace(/^```(?:json)?\s*/, '')
          .replace(/\s*```$/, '');
        resolve(JSON.parse(text) as Record<string, unknown>);
      } catch {
        reject(new Error(`codex exited ${String(code)}: ${errors.slice(-400)}`));
      }
    });
    child.stdin.end(`${PROMPT}\n\nINPUT:\n${JSON.stringify(input)}`);
  });
}

function batches(list: readonly Unit[]): Unit[][] {
  const out: Unit[][] = [];
  let current: Unit[] = [];
  let size = 0;
  for (const unit of list) {
    const length = JSON.stringify(unit.english).length;
    if (current.length > 0 && size + length > BATCH_CHARS) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(unit);
    size += length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

let made = 0;
const failed: string[] = [];
async function run(batch: readonly Unit[], alone = false): Promise<void> {
  let answer: Record<string, unknown>;
  try {
    answer = await codex(Object.fromEntries(batch.map((unit) => [unit.key, unit.english])));
  } catch (error) {
    if (!alone && batch.length > 1) {
      for (const unit of batch) await run([unit], true);
      return;
    }
    failed.push(...batch.map((unit) => `${unit.key}: ${(error as Error).message.slice(0, 120)}`));
    return;
  }
  for (const unit of batch) {
    const problem = checkTranslation(unit.english, answer[unit.key]);
    if (problem === null) {
      kept[unit.key] = { hash: hashOf(unit.english), ru: answer[unit.key] as Strings };
      made += 1;
    } else if (!alone) await run([unit], true);
    else failed.push(`${unit.key}: ${problem}`);
  }
  save();
  process.stdout.write(
    `  ${String(made)}/${String(todo.length)} made, ${String(failed.length)} left\n`,
  );
}

const queue = batches(todo);
await Promise.all(
  Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let batch = queue.shift(); batch; batch = queue.shift()) await run(batch);
  }),
);
save();
process.stdout.write(
  `${dataset}: ${String(made)} made; ${String(failed.length)} left for the next run\n`,
);
for (const line of failed.slice(0, 40)) process.stdout.write(`  ${line}\n`);
