import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';

interface Finding {
  level: string;
  rule: string;
  where: string;
  detail: string;
}
interface Measurements {
  auditPage: (page: Page) => Promise<Finding[]>;
}
const auditPath = process.argv[2] ?? join(homedir(), '.agents/skills/ui-layout-audit/audit.mjs');
const { auditPage } = (await import(pathToFileURL(auditPath).href)) as Measurements;
const evidence = new URL('../../reports/evidence/mixed-ten-2026-11-08/layout/', import.meta.url);
await mkdir(evidence, { recursive: true });
const widths = [1440, 768, 390, 320];

async function htmlFiles(directory: URL): Promise<URL[]> {
  const result: URL[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !['source', 'variants', 'maps'].includes(entry.name))
      result.push(...(await htmlFiles(new URL(`${entry.name}/`, directory))));
    else if (entry.isFile() && entry.name.endsWith('.html'))
      result.push(new URL(entry.name, directory));
  }
  return result;
}

const files = await htmlFiles(COLLECTION_ROOT);
const titles = new Set<string>();
let links = 0;
for (const file of files) {
  const html = await readFile(file, 'utf8');
  const title = /<title>(.*?)<\/title>/s.exec(html)?.[1];
  assert(title && !titles.has(title), `Missing/duplicate title: ${file.pathname}`);
  titles.add(title);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (!reference || reference.startsWith('#')) continue;
    assert(!/^(https?:|javascript:|data:)/i.test(reference), `External dependency ${reference}`);
    assert((await stat(new URL(reference, file))).isFile(), `Broken link: ${reference}`);
    links++;
  }
}

const browser = await chromium.launch();
const rows: { file: string; width: number; findings: Finding[]; axe: string[] }[] = [];
const screenshots: string[] = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Every rendered page is measured. Screenshots sample each template at every width.
  const sample = await loadSource(SLUGS[0]);
  const screenshotPages = new Set([
    'index.html',
    ...['index.html', 'players.html', 'session-1.html', 'session-8.html', 'maps.html'].map(
      (name) => `${SLUGS[0]}/${name}`,
    ),
    `${SLUGS[0]}/handouts/${sample.handouts[0]?.key ?? ''}.html`,
  ]);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const file of files) {
      await page.goto(file.href);
      const findings = await auditPage(page);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      const name = file.href.slice(COLLECTION_ROOT.href.length);
      rows.push({ file: name, width, findings, axe: axe.violations.map((v) => v.id) });
      if (screenshotPages.has(name)) {
        const shot = `${width}-${name.replaceAll('/', '-').replace('.html', '')}.png`;
        await page.screenshot({
          path: new URL(shot, evidence).pathname,
          fullPage: name === 'index.html',
        });
        screenshots.push(shot);
        const detailSelector = name.endsWith('/maps.html')
          ? '.map-frame'
          : name.endsWith('/players.html')
            ? '.sheet'
            : null;
        if (detailSelector) {
          await page.locator(detailSelector).first().scrollIntoViewIfNeeded();
          const detail = shot.replace('.png', '-detail.png');
          await page.screenshot({ path: new URL(detail, evidence).pathname });
          screenshots.push(detail);
        }
      }
    }
    process.stdout.write(`${width}px: ${files.length} pages measured\n`);
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL('results.json', evidence),
  `${JSON.stringify(
    {
      htmlFiles: files.length,
      checkedLinks: links,
      widths,
      measurements: rows,
      screenshots,
    },
    null,
    2,
  )}\n`,
);
const problems = rows.flatMap((r) => [
  ...r.findings
    .filter((f) => f.level === 'error' || f.level === 'warn')
    .map((f) => `${r.file}@${r.width}: ${f.rule} ${f.detail}`),
  ...r.axe.map((rule) => `${r.file}@${r.width}: axe ${rule}`),
]);
if (problems.length) throw new Error(problems.slice(0, 30).join('\n'));
process.stdout.write(
  `${files.length} HTML files, ${links} links, ${rows.length} responsive/axe measurements: PASS\n`,
);
