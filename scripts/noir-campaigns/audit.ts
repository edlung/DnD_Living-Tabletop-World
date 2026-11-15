import { chromium, type Page } from '@playwright/test';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';

// Use the installed ui-layout-audit skill without baking a user-specific path into the repo.
const auditor = process.argv[2];
if (!auditor)
  throw new Error(
    'Usage: node scripts/noir-campaigns/audit.ts /absolute/path/to/ui-layout-audit/audit.mjs',
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
const root = fileURLToPath(new URL('../../campaigns/noir-2026/', import.meta.url));
const evidence = fileURLToPath(
  new URL('../../reports/evidence/noir-ten-2026-11-08/', import.meta.url),
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
const selected = process.argv.slice(3);
const selectedPages = selected.length
  ? pages.filter((path) => selected.some((slug) => path.startsWith(join(root, slug) + '/')))
  : pages;
const browser = await chromium.launch({ headless: true });
const results: { page: string; width: number; findings: Finding[] }[] = [];
const titles: Record<string, string> = {};
const missingLinks = new Set<string>();
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of selectedPages.sort()) {
      await page.goto(pathToFileURL(path).href);
      const title = await page.title();
      titles[relative(root, path)] = title;
      const findings = await auditPage(page);
      results.push({ page: relative(root, path), width, findings });
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
            missingLinks.add(`${relative(root, path)} → ${link}`);
          }
        }
      }
    }
    const screenshots = selected.length
      ? [
          [`${selected[0]}/index.html`, 'book'],
          [`${selected[0]}/session-1.html`, 'session'],
          [`${selected[0]}/players.html`, 'players'],
          [`${selected[0]}/maps.html`, 'maps'],
        ]
      : [
          ['index.html', 'catalog'],
          ['rain-check/index.html', 'book'],
          ['white-ash/session-1.html', 'session'],
          ['seventh-negative/players.html', 'players'],
          ['room-608/maps.html', 'maps'],
          ['false-verdict/handouts/shared-interview.html', 'handout'],
        ];
    for (const [file, name] of screenshots) {
      if (!file || !name) continue;
      await page.goto(pathToFileURL(join(root, file)).href);
      await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: false });
      await page.screenshot({ path: join(evidence, `${name}-${width}-full.png`), fullPage: true });
      const detail = name === 'maps' ? 'img' : name === 'players' ? '.hero-entry' : null;
      if (detail) {
        await page.locator(detail).first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(evidence, `${name}-${width}-detail.png`) });
      }
    }
  }
  await writeFile(
    join(evidence, selected.length ? `layout-${selected.join('-')}.json` : 'layout.json'),
    `${JSON.stringify(
      {
        pages: selectedPages.length,
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
        pages: selectedPages.length,
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
