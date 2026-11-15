import { chromium, type Page } from '@playwright/test';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

// Use the installed ui-layout-audit skill without baking a user-specific path into the repo.
const auditor = process.argv[2];
if (!auditor)
  throw new Error(
    'Usage: node scripts/fantasy-campaigns/audit.ts /absolute/path/to/ui-layout-audit/audit.mjs',
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
const root = fileURLToPath(new URL('../../campaigns/fantasy-2026/', import.meta.url));
const evidence = fileURLToPath(
  new URL('../../reports/evidence/fantasy-ten-2026-11-08/', import.meta.url),
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
await scan(root);
const browser = await chromium.launch({ headless: true });
const results: { page: string; width: number; findings: Finding[] }[] = [];
const titles: Record<string, string> = {};
const missingLinks = new Set<string>();
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.request().url().startsWith('file:') ? route.continue() : route.abort(),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of pages.sort()) {
      await page.goto(pathToFileURL(path).href);
      const title = await page.title();
      titles[path.slice(root.length + 1)] = title;
      const findings = await auditPage(page);
      results.push({ page: path.slice(root.length + 1), width, findings });
      if (width === 1440) {
        const links = await page
          .locator('a[href], img[src], link[href]')
          .evaluateAll((nodes) =>
            nodes.map((node) =>
              node instanceof HTMLImageElement
                ? node.src
                : (node as HTMLAnchorElement | HTMLLinkElement).href,
            ),
          );
        for (const link of links.filter((value) => value.startsWith('file:'))) {
          try {
            await access(fileURLToPath(link));
          } catch {
            missingLinks.add(`${path.slice(root.length + 1)} → ${link}`);
          }
        }
      }
    }
    for (const [file, name] of [
      ['index.html', 'catalog'],
      ['dungeon-sanctuary/index.html', 'book'],
      ['small-banner/session-1.html', 'session'],
      ['storm-kitchen/players.html', 'players'],
      ['basalt-bloom/maps.html', 'maps'],
    ] as const) {
      await page.goto(pathToFileURL(join(root, file)).href);
      await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: false });
      if (name === 'maps')
        await page
          .locator('img.map')
          .first()
          .screenshot({
            path: join(evidence, `map-detail-${width}.png`),
          });
      if (name === 'players')
        await page
          .locator('.hero-entry')
          .first()
          .screenshot({
            path: join(evidence, `hero-detail-${width}.png`),
          });
    }
  }
  await writeFile(
    join(evidence, 'layout.json'),
    `${JSON.stringify(
      {
        pages: pages.length,
        widths: [1440, 768, 390, 320],
        errors,
        missingLinks: [...missingLinks],
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
        missingLinks: [...missingLinks],
        titleFindings: auditTitles(titles),
        findings: failures.slice(0, 30),
        totalFindings: failures.length,
      },
      null,
      2,
    ) + '\n',
  );
  if (failures.length || errors.length || missingLinks.size || auditTitles(titles).length)
    process.exitCode = 1;
} finally {
  await browser.close();
}
