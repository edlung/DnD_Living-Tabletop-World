import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { COLLECTION_ROOT, SLUGS } from './source.ts';

// Pass the installed ui-layout-audit skill's audit.mjs path explicitly.
if (!process.argv[2]) throw new Error('Usage: node layout-audit.ts /path/to/audit.mjs [slug ...]');
interface Finding {
  level: 'error' | 'warn' | 'info';
  rule: string;
  where: string;
  detail: string;
}
const { auditPage, auditTitles } = (await import(pathToFileURL(process.argv[2]).href)) as {
  auditPage: (page: Page) => Promise<Finding[]>;
  auditTitles: (titles: Record<string, string>) => Finding[];
};
const evidence = new URL('../../reports/evidence/dark-fantasy-2026-11-08/layout/', import.meta.url);
await mkdir(evidence, { recursive: true });
const selected = process.argv.slice(3);
for (const slug of selected)
  if (!SLUGS.some((known) => known === slug)) throw new Error(`Unknown campaign ${slug}`);
const pages = selected.length ? [] : ['index.html'];
for (const slug of selected.length ? selected : SLUGS) {
  for (const file of await readdir(new URL(`${slug}/`, COLLECTION_ROOT)))
    if (file.endsWith('.html')) pages.push(`${slug}/${file}`);
  for (const file of await readdir(new URL(`${slug}/handouts/`, COLLECTION_ROOT)))
    if (file.endsWith('.html')) pages.push(`${slug}/handouts/${file}`);
}
const screenshots = new Set([
  'index.html',
  `${SLUGS[0]}/index.html`,
  `${SLUGS[0]}/players.html`,
  `${SLUGS[0]}/session-1.html`,
  `${SLUGS[0]}/maps.html`,
  `${SLUGS[4]}/index.html`,
]);
const browser = await chromium.launch();
const results = [];
const titles: Record<string, string> = {};
try {
  const context = await browser.newContext();
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of pages) {
      await page.goto(new URL(path, COLLECTION_ROOT).href, { waitUntil: 'load' });
      titles[path] = await page.title();
      const findings = await auditPage(page);
      results.push({ path, width, findings });
      if (screenshots.has(path)) {
        await page.screenshot({
          path: fileURLToPath(new URL(`${path.replaceAll('/', '_')}-${width}.png`, evidence)),
        });
        if (path === 'index.html' || path === `${SLUGS[0]}/players.html`)
          await page.screenshot({
            path: fileURLToPath(
              new URL(`${path.replaceAll('/', '_')}-${width}-full.png`, evidence),
            ),
            fullPage: true,
          });
        if (path === `${SLUGS[0]}/maps.html`)
          await page
            .locator('section.panel')
            .nth(1)
            .screenshot({
              path: fileURLToPath(new URL(`first-encounter-${width}.png`, evidence)),
            });
      }
      if (await page.locator('details').count()) {
        await page.locator('details').evaluateAll((elements) => {
          for (const element of elements) element.setAttribute('open', '');
        });
        results.push({ path, width, state: 'expanded-details', findings: await auditPage(page) });
        if (path === `${SLUGS[0]}/index.html`)
          await page
            .locator('details')
            .first()
            .screenshot({
              path: fileURLToPath(new URL(`expanded-npc-${width}.png`, evidence)),
            });
      }
    }
    process.stdout.write(`${width}px: ${pages.length} pages audited\n`);
  }
} finally {
  await browser.close();
}
const titleFindings = auditTitles(titles);
const errors = results.flatMap((r) => r.findings).filter((f) => f.level === 'error');
const warnings = results.flatMap((r) => r.findings).filter((f) => f.level === 'warn');
await writeFile(
  new URL(selected.length ? `results-${selected.join('-')}.json` : 'results.json', evidence),
  `${JSON.stringify({ pageCount: pages.length, errors: errors.length, warnings: warnings.length, titleFindings, results }, null, 2)}\n`,
);
process.stdout.write(
  `${errors.length} errors, ${warnings.length} warnings, ${titleFindings.length} title findings\n`,
);
if (errors.length || warnings.length || titleFindings.length) process.exitCode = 1;
