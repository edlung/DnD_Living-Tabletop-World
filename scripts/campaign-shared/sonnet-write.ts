import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

import { campaignOf, type Series } from './series.ts';
import { runJob, spentMicros, type Budget } from './sonnet-author.ts';

/**
 * Writes a reworked campaign's `source/` with Sonnet 5.5 from the Opus skeleton
 * (`campaigns/distinctness/<slug>-skeleton.md`). Usage, from the repository root:
 *
 *   node --env-file=.env.local --conditions=@ltw/source scripts/campaign-shared/sonnet-write.ts \
 *     <series>/<slug> <job...>
 *
 * Jobs: `world`, `cast`, `clues`, `encounters`, `items`, `case` (noir only), `session-N`,
 * `all-sessions`, and `assemble` (copies the answers into `source/`, two sessions per file). Answers and the ledger are kept in
 * `reports/evidence/<slug>-rework-<date>/sonnet/`. Paid: run only within the owner's ceiling.
 */
const ROOT = new URL('../../', import.meta.url);
// Evidence folder per reworked campaign: the day its rework started.
const DATES: Record<string, string> = {
  'sky-archipelago': '2026-11-13',
  'clockwork-carnival': '2026-11-14',
  'mountain-wedding': '2026-11-14',
  'marrow-crown': '2026-11-14',
  'salt-widows': '2026-11-14',
  'last-orbit': '2026-11-14',
  'rain-check': '2026-11-14',
};
const dateOf = (slug: string): string => {
  const date = DATES[slug];
  if (!date) throw new Error(`no rework date for ${slug}`);
  return date;
};
const CEILING_USD = 30;
const STOP_USD = 25;

const str = { type: 'string' } as const;
const strs = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const scene = obj({
  title: str,
  minutes: { type: 'integer' },
  play: str,
  choices: strs,
  check: str,
  failForward: str,
});
const session = obj({
  number: { type: 'integer' },
  key: str,
  title: str,
  location: str,
  participants: strs,
  clues: strs,
  goal: str,
  readAloud: str,
  scenes: { type: 'array', items: scene },
  spotlight: strs,
  consequences: { type: 'array', items: obj({ if: str, then: str }) },
  handouts: strs,
  ending: str,
  dmNote: str,
});
const npc = obj({
  key: str,
  name: str,
  age: { type: 'integer' },
  location: str,
  look: str,
  public: str,
  want: str,
  secret: str,
  knows: strs,
  boundary: str,
  reveal: str,
  voice: str,
});
const hero = obj({
  key: str,
  name: str,
  age: { type: 'integer' },
  role: str,
  archetype: { type: 'string', enum: ['fighter', 'rogue', 'cleric', 'wizard'] },
  look: str,
  hook: str,
  bond: str,
  personalQuestion: str,
  spotlight: str,
});
const clue = obj({
  key: str,
  name: str,
  location: str,
  appearance: str,
  statement: str,
  subjects: strs,
  discovery: str,
  fallback: str,
});
const handout = obj({ key: str, title: str, unlock: str, text: str });
const foe = obj({ srd: str, name: str, description: str, count: { type: 'integer' } });
const encounter = obj({
  key: str,
  title: str,
  location: str,
  trigger: str,
  objective: str,
  tactics: str,
  peaceful: str,
  scaling: str,
  terrain: str,
  layout: str,
  mandatory: { type: 'boolean' },
  foes: { type: 'array', items: foe },
  boss: obj({ srd: str, name: str, description: str }),
});
const item = obj({
  key: str,
  name: str,
  location: { type: ['string', 'null'] },
  holder: { type: ['string', 'null'] },
  appears: { type: 'integer' },
  description: str,
  use: str,
  evidence: { type: 'boolean' },
});
const world = obj({
  engine: str,
  slug: str,
  title: str,
  genre: str,
  audience: str,
  minPlayers: { type: 'integer' },
  maxPlayers: { type: 'integer' },
  defaultPlayers: { type: 'integer' },
  sessionCount: { type: 'integer' },
  sessionDuration: str,
  pitch: str,
  setting: str,
  tone: str,
  worldName: str,
  startLocation: str,
  opening: str,
  truth: strs,
  themes: strs,
  boundaries: strs,
  tableGuidance: strs,
  scaling: { type: 'array', items: obj({ players: { type: 'integer' }, guidance: str }) },
  endings: { type: 'array', items: obj({ title: str, requires: str, outcome: str, cost: str }) },
  locations: {
    type: 'array',
    items: obj({
      key: str,
      name: str,
      type: { type: 'string', enum: ['region', 'settlement', 'site', 'building'] },
      parent: { type: ['string', 'null'] },
      description: str,
    }),
  },
});
const props = (schema: Record<string, unknown>) => schema['properties'] as Record<string, unknown>;
// The noir series adds start hour and weather to the world, a status to NPCs and a detective case.
const noirWorld = obj({
  ...props(world),
  startHour: { type: 'integer' },
  weather: { type: 'string', enum: ['clear', 'overcast', 'rain', 'storm', 'fog', 'snow'] },
});
const noirNpc = obj({ ...props(npc), status: { type: 'string', enum: ['active', 'dead'] } });
const detectiveCase = obj({
  centralQuestion: str,
  culprit: str,
  motive: str,
  method: str,
  timeline: { type: 'array', items: obj({ when: str, event: str, witnesses: strs }) },
  routes: { type: 'array', items: obj({ key: str, label: str, clues: strs, reasoning: str }) },
  suspects: {
    type: 'array',
    items: obj({ npc: str, apparentMotive: str, against: str, exoneration: str }),
  },
  redHerrings: { type: 'array', items: obj({ claim: str, refutation: str, clues: strs }) },
  failureRecovery: strs,
});
const SCHEMAS: Record<string, Record<string, unknown>> = {
  world,
  noirWorld,
  case: detectiveCase,
  cast: obj({ heroes: { type: 'array', items: hero }, npcs: { type: 'array', items: npc } }),
  noirCast: obj({
    heroes: { type: 'array', items: hero },
    npcs: { type: 'array', items: noirNpc },
  }),
  clues: obj({
    clues: { type: 'array', items: clue },
    handouts: { type: 'array', items: handout },
  }),
  encounters: obj({ encounters: { type: 'array', items: encounter } }),
  items: obj({ items: { type: 'array', items: item } }),
  session,
};

const read = (path: string) => readFile(new URL(path, ROOT), 'utf8');

async function system(slug: string): Promise<string> {
  const [brief, author, contract, skeleton] = await Promise.all([
    read(`campaigns/distinctness/${slug}-brief.md`),
    read('campaigns/distinctness/AUTHOR_BRIEF.md'),
    read(`scripts/${series.tool}/CONTENT_CONTRACT.md`),
    read(`campaigns/distinctness/${slug}-skeleton.md`),
  ]);
  return [
    'Ты пишешь исходники настольной кампании на русском языке. Сюжет, ключи, числа и порядок событий уже решены в скелете: следуй ему точно, ничего не меняй в сюжете и не придумывай новых ключей. Твоя работа — живой, запускаемый текст для ведущего: сцены, реплики NPC прямой речью в кавычках «…», описания мест, механика проверок. Задание кампании важнее контракта там, где они расходятся (например, две сцены в вечере, поле voice у NPC, поля encounters в формате задания). Строки не длиннее 1800 символов. Ничего из правды и тайн не попадает в поля для игроков.',
    `# Задание кампании\n${brief}`,
    `# Общая памятка автора\n${author}`,
    `# Контракт полей\n${contract}`,
    `# Скелет (Opus 5.5)\n${skeleton}`,
  ].join('\n\n');
}

const evidence = (slug: string) => `reports/evidence/${slug}-rework-${dateOf(slug)}/sonnet/`;

async function context(files: string[]): Promise<string> {
  const parts = await Promise.all(
    files.map(async (file) => {
      try {
        return `## ${file}\n${await read(file)}`;
      } catch {
        return '';
      }
    }),
  );
  return parts.filter(Boolean).join('\n\n');
}

function jobPrompt(
  slug: string,
  job: string,
): { tool: string; schema: Record<string, unknown>; files: string[]; ask: string } {
  const src = `campaigns/${series.name}/${slug}/source/`;
  const out = evidence(slug);
  const noir = series.name === 'noir-2026';
  const fresh = [
    `${out}world.json`,
    `${out}cast.json`,
    `${out}clues.json`,
    `${out}encounters.json`,
    `${out}items.json`,
    ...(noir ? [`${out}case.json`] : []),
  ];
  if (job === 'world')
    return {
      tool: 'write_world',
      schema: SCHEMAS[noir ? 'noirWorld' : 'world'] ?? {},
      files: [`${src}world.json`],
      ask: 'Напиши новый world.json по скелету. Сохрани безопасность, возраст, размеры стола и ключи мест; обнови engine, sessionCount, sessionDuration, truth, tableGuidance (без круга «каждый называет»), scaling для каждого размера стола от minPlayers до 8, endings и описания мест. Ниже текущий файл для того, что сохраняется.',
    };
  if (job === 'cast')
    return {
      tool: 'write_cast',
      schema: SCHEMAS[noir ? 'noirCast' : 'cast'] ?? {},
      files: [`${src}cast.json`, `${out}world.json`],
      ask: 'Напиши новый cast.json по скелету: восемь героев с прежними ключами, именами и классами (правь только то, что требует новая история) и всех NPC скелета с полем voice. knows — только знание этого NPC.',
    };
  if (job === 'clues')
    return {
      tool: 'write_clues',
      schema: SCHEMAS['clues'] ?? {},
      files: [`${src}clues.json`, `${src}handouts.json`, `${out}world.json`, `${out}cast.json`],
      ask: 'Напиши улики и раздатки по скелету. Тексты раздаток — точный текст для игроков.',
    };
  if (job === 'encounters')
    return {
      tool: 'write_encounters',
      schema: SCHEMAS['encounters'] ?? {},
      files: [`${out}world.json`, `${out}cast.json`],
      ask: 'Напиши встречи по скелету в формате задания (foes, boss, layout, mandatory). Если у встречи нет босса, верни boss с пустыми строками.',
    };
  if (job === 'items')
    return {
      tool: 'write_items',
      schema: SCHEMAS['items'] ?? {},
      files: [`${out}world.json`, `${out}cast.json`],
      ask: 'Напиши сюжетные предметы по разделу «Предметы» скелета. У каждого ровно одно из location (ключ места) или holder (ключ одного из основных героев: первые minPlayers в cast.json), другое null. description — только внешний вид, без тайн; use — как предмет работает в игре.',
    };
  if (job === 'case' && noir)
    return {
      tool: 'write_case',
      schema: SCHEMAS['case'] ?? {},
      files: [`${out}world.json`, `${out}cast.json`, `${out}clues.json`],
      ask: 'Напиши case.json по разделу «Дело» скелета: все поля контракта. culprit, witnesses и suspects[].npc — ключи NPC из cast.json; clues у маршрутов и ложных версий — ключи из clues.json, у каждого маршрута не меньше двух разных улик. Хронология — только прошлое до начала игры. Никто не обязан признаваться.',
    };
  const n = /^session-(\d+)$/.exec(job)?.[1];
  if (n)
    return {
      tool: 'write_session',
      schema: SCHEMAS['session'] ?? {},
      files: fresh,
      ask: `Напиши вечер ${n} по скелету: один объект сессии. Столько сцен, сколько у этого вечера в скелете; play каждой 150–250 слов с репликами присутствующих NPC прямой речью (не меньше двух на NPC в сцене), голоса как в voice. Сумма минут сцен соответствует sessionDuration. Изменения шкалы давления из задания назови числами там, где они происходят. Ключи участников, улик и раздаток — только существующие.`,
    };
  throw new Error(`unknown job ${job}`);
}

/** First place where an answer breaks its schema's types (the API does not enforce them), or null. */
function mismatch(schema: Record<string, unknown>, value: unknown, path = '$'): string | null {
  const type = schema['type'];
  if (type === 'string') return typeof value === 'string' ? null : path;
  if (type === 'integer') return Number.isInteger(value) ? null : path;
  if (type === 'array') {
    if (!Array.isArray(value)) return path;
    const items = schema['items'] as Record<string, unknown>;
    for (const [i, entry] of value.entries()) {
      const found = mismatch(items, entry, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return path;
    const record = value as Record<string, unknown>;
    for (const [key, sub] of Object.entries(schema['properties'] as Record<string, unknown>)) {
      const found = mismatch(sub as Record<string, unknown>, record[key], `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

async function runOne(slug: string, job: string, budget: Budget, sys: string): Promise<void> {
  const spec = jobPrompt(slug, job);
  const prompt = `${spec.ask}\n\n${await context(spec.files)}`;
  const output = await runJob(
    { campaign: slug, name: job, system: sys, prompt, toolName: spec.tool, schema: spec.schema },
    budget,
  );
  const broken = mismatch(spec.schema, output);
  const file = broken ? `${job}.rejected.json` : `${job}.json`;
  await writeFile(
    new URL(`${evidence(slug)}${file}`, ROOT),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  if (broken) throw new Error(`${job}: answer breaks the schema at ${broken}; kept as ${file}`);
  process.stdout.write(
    `${job}: written; spent $${((await spentMicros(budget.ledger, slug)) / 1e6).toFixed(3)}\n`,
  );
}

async function assemble(slug: string): Promise<void> {
  const out = evidence(slug);
  const src = `campaigns/${series.name}/${slug}/source/`;
  const load = async (job: string) =>
    JSON.parse(await read(`${out}${job}.json`)) as Record<string, unknown>;
  const save = (file: string, value: unknown) =>
    writeFile(new URL(`${src}${file}`, ROOT), `${JSON.stringify(value, null, 2)}\n`);
  const encounters = ((await load('encounters'))['encounters'] as Record<string, unknown>[]).map(
    (e) => {
      const boss = e['boss'] as Record<string, string> | undefined;
      return boss && boss['srd']
        ? e
        : Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'boss'));
    },
  );
  const clues = await load('clues');
  await Promise.all([
    save('world.json', await load('world')),
    save('cast.json', await load('cast')),
    save('clues.json', clues['clues']),
    save('handouts.json', clues['handouts']),
    save('encounters.json', encounters),
    save('items.json', (await load('items'))['items']),
    ...(series.name === 'noir-2026' ? [save('case.json', await load('case'))] : []),
  ]);
  const sessions = (await readdir(new URL(out, ROOT)))
    .flatMap((f) => /^session-(\d+)\.json$/.exec(f)?.[1] ?? [])
    .map(Number)
    .sort((a, b) => a - b);
  for (const f of await readdir(new URL(src, ROOT)))
    if (/^sessions-\d+\.json$/.test(f)) await rm(new URL(`${src}${f}`, ROOT));
  for (let i = 0; i < sessions.length; i += 2) {
    const pair = await Promise.all(sessions.slice(i, i + 2).map((n) => load(`session-${n}`)));
    await save(`sessions-${i / 2 + 1}.json`, pair);
  }
  process.stdout.write(`assembled ${sessions.length} sessions into ${src}\n`);
}

const [id, ...jobs] = process.argv.slice(2);
if (!id || jobs.length === 0) throw new Error('usage: sonnet-write.ts <series>/<slug> <job...>');
const campaign = campaignOf(id);
const series: Series = campaign.series;
const slug = campaign.slug;
await mkdir(new URL(evidence(slug), ROOT), { recursive: true });
const budget: Budget = {
  ledger: new URL(`reports/evidence/${slug}-rework-${dateOf(slug)}/sonnet-ledger.jsonl`, ROOT)
    .pathname,
  ceilingUsd: CEILING_USD,
  stopUsd: STOP_USD,
  maxTokens: 64_000,
};
if (jobs.includes('assemble')) await assemble(slug);
else {
  const sys = await system(slug);
  const count = jobs.includes('all-sessions')
    ? (JSON.parse(await read(`${evidence(slug)}world.json`)) as { sessionCount: number })
        .sessionCount
    : 0;
  const expanded = jobs.flatMap((job) =>
    job === 'all-sessions' ? Array.from({ length: count }, (_, i) => `session-${i + 1}`) : [job],
  );
  // The first job writes the cache prefix; the rest run four at a time and read it.
  const [first, ...rest] = expanded;
  if (first) await runOne(slug, first, budget, sys);
  // One rejected answer must not abort the requests still streaming beside it.
  const failed: string[] = [];
  for (let i = 0; i < rest.length; i += 4) {
    const settled = await Promise.allSettled(
      rest.slice(i, i + 4).map((job) => runOne(slug, job, budget, sys)),
    );
    for (const r of settled)
      if (r.status === 'rejected')
        failed.push(r.reason instanceof Error ? r.reason.message : JSON.stringify(r.reason));
  }
  if (failed.length > 0) throw new Error(failed.join('\n'));
}
