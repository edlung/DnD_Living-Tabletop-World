import { chromium, type Page } from '@playwright/test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { SLUGS } from './source.ts';

// Use the installed ui-layout-audit skill without baking a user-specific path into the repo.
const auditor = process.argv[2];
const selected = process.argv.slice(3);
for (const slug of selected)
  if (!(SLUGS as readonly string[]).includes(slug)) throw new Error(`Unknown campaign: ${slug}`);
if (!auditor)
  throw new Error(
    'Usage: node scripts/campaign-collection/audit.ts /absolute/path/to/ui-layout-audit/audit.mjs',
  );
interface Finding {
  level: string;
  rule: string;
  where: string;
  detail: string;
}
interface Auditors {
  auditPage: (page: Page) => Promise<Finding[]>;
  auditTitles: (titles: Record<string, string>) => Finding[];
}
const { auditPage, auditTitles } = (await import(pathToFileURL(auditor).href)) as Auditors;
const root = fileURLToPath(new URL('../../campaigns/collection-2026/', import.meta.url));
const evidence = fileURLToPath(
  new URL('../../reports/evidence/ten-campaigns-2026-11-08/', import.meta.url),
);
await mkdir(evidence, { recursive: true });
const pages: string[] = [];
async function scan(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !['source', 'variants', 'maps'].includes(entry.name))
      await scan(path);
    else if (entry.isFile() && entry.name.endsWith('.html')) pages.push(path);
  }
}
if (selected.length) {
  for (const slug of selected) await scan(join(root, slug));
} else await scan(root);
const browser = await chromium.launch({ headless: true });
const results: { page: string; width: number; findings: Finding[] }[] = [];
const titles: Record<string, string> = {};
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of pages.sort()) {
      await page.goto(pathToFileURL(path).href);
      await page.locator('details').evaluateAll((elements) => {
        for (const element of elements) (element as HTMLDetailsElement).open = true;
      });
      const title = await page.title();
      titles[path.slice(root.length + 1)] = title;
      const findings = await auditPage(page);
      results.push({ page: path.slice(root.length + 1), width, findings });
    }
    const previews: [string, string][] = selected.length
      ? selected.flatMap((slug) =>
          ['index', 'players', 'session-1', 'maps'].map((name): [string, string] => [
            `${slug}/${name}.html`,
            `${slug}-${name}`,
          ]),
        )
      : [
          ['index.html', 'catalog'],
          ['sky-archipelago/index.html', 'book'],
          ['velvet-ledger/session-1.html', 'session'],
          ['last-orbit/players.html', 'players'],
          ['salt-meridian/maps.html', 'maps'],
        ];
    for (const [file, name] of previews) {
      await page.goto(pathToFileURL(join(root, file)).href);
      await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: false });
      await page.screenshot({ path: join(evidence, `${name}-${width}-full.png`), fullPage: true });
      if (file.endsWith('/maps.html'))
        await page
          .locator('.map-scroll')
          .first()
          .screenshot({
            path: join(evidence, `${name}-${width}-grid.png`),
          });
    }
  }
  await writeFile(
    join(evidence, selected.length ? `layout-${selected.join('-')}.json` : 'layout.json'),
    `${JSON.stringify(
      {
        pages: pages.length,
        widths: [1440, 768, 390, 320],
        errors,
        titleFindings: auditTitles(titles),
        results,
      },
      null,
      2,
    )}\n`,
  );
  const failures = results.flatMap((r) =>
    r.findings.filter((f) => f.level !== 'info').map((f) => ({ ...r, findings: [f] })),
  );
  process.stdout.write(
    JSON.stringify(
      {
        pages: pages.length,
        states: results.length,
        errors,
        titleFindings: auditTitles(titles),
        findings: failures.slice(0, 30),
        totalFindings: failures.length,
      },
      null,
      2,
    ) + '\n',
  );
  if (failures.length || errors.length || auditTitles(titles).length) process.exitCode = 1;
} finally {
  await browser.close();
}
