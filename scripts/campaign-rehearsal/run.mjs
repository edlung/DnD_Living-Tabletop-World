import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { books, ROOT } from './books.mjs';
import { earlyPages } from './early-pages.mjs';
import { leaveBattleSites } from './encounters.mjs';
import { rehearse } from './play.mjs';
import { bellReturn, checkReturn } from './hollowmere.mjs';
const dir = join(ROOT, 'reports/evidence/campaign-rehearsal-2026-11-22');
await mkdir(dir, { recursive: true });
const bySlug = books(),
  selected = process.argv.slice(2),
  failures = [];
if (selected.some((k) => !bySlug.has(k))) throw Error('Unknown campaign');
for (const book of selected.length ? selected.map((k) => bySlug.get(k)) : bySlug.values()) {
  const runs = [];
  for (const route of ['normal', 'refusal', 'discovery', 'defeat']) {
    try {
      runs.push(await rehearse(book, route));
    } catch (error) {
      failures.push([book.slug, route, String(error)]);
      process.stderr.write(
        [book.slug, route, error.stack?.split('\n').slice(0, 3).join('\n')].join(' ') + '\n',
      );
    }
  }
  if (runs.length === 4) {
    const bypasses = await leaveBattleSites(book);
    await writeFile(
      join(dir, book.slug + '.json'),
      JSON.stringify({ slug: book.slug, title: book.title, runs, bypasses }, null, 2) + '\n',
    );
    process.stdout.write(book.slug + ' ' + runs.map((r) => r.worldEvents).join(' / ') + '\n');
  }
}
const returns = [await bellReturn(false), await bellReturn(true)];
returns.forEach(checkReturn);
await writeFile(join(dir, 'hollowmere-after.json'), JSON.stringify(returns, null, 2) + '\n');
if (!selected.length) {
  const pages = await earlyPages();
  await writeFile(join(dir, 'early-pages-after.json'), JSON.stringify(pages, null, 2) + '\n');
}
if (failures.length) process.exitCode = 1;
else if (!selected.length) await (await import('./report.mjs')).report();
