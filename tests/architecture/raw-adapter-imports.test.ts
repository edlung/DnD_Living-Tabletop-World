import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Raw provider adapters are constructed only by gateway composition (docs/adr/0032-live-ai.md, B2;
 * B1 Opus max finding 3). This check resolves every module specifier with the TypeScript compiler's
 * own module resolution (so `./anthropic-provider.js`, `../ai/raw-provider.ts` and re-exports all
 * resolve to the same file) instead of matching file names. A value import, re-export or dynamic
 * import of a raw adapter module is allowed only in the adapter modules themselves, in
 * `ai/gateway.ts` (which wraps every adapter in the admission wrapper) and in `*.test.ts`. Type-only
 * imports are erased and allowed. A dynamic import or `require` whose specifier is not a literal is
 * refused everywhere outside tests, because it cannot be resolved statically.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER = join(ROOT, 'apps', 'server', 'src');
const RAW = new Set(
  ['raw-provider.ts', 'anthropic-provider.ts', 'openai-compatible-provider.ts'].map((name) =>
    join(SERVER, 'ai', name),
  ),
);
const COMPOSER = join(SERVER, 'ai', 'gateway.ts');
/**
 * Offline tools the owner runs by hand, never imported by the application (checked below): the
 * Sonnet 5.5 campaign writer (owner decision 2026-11-13, its own ledger and spending ceiling,
 * `scripts/campaign-shared/AGENTS.md`) builds the Anthropic adapter directly, and the book layout
 * audits load an auditor module by the path they are given. Nothing else under `scripts/` may.
 */
const OFFLINE_TOOLS: ReadonlyMap<string, string> = new Map([
  ['scripts/campaign-shared/sonnet-author.ts', '../../apps/server/src/ai/anthropic-provider.ts'],
  ['scripts/campaign-shared/sonnet-stream.ts', '../../apps/server/src/ai/anthropic-provider.ts'],
  ['scripts/campaign-collection/audit.ts', '(computed specifier)'],
  ['scripts/dark-fantasy/layout-audit.ts', '(computed specifier)'],
  ['scripts/fantasy-campaigns/audit.ts', '(computed specifier)'],
  ['scripts/mixed-campaigns/audit.ts', '(computed specifier)'],
  ['scripts/noir-campaigns/audit.ts', '(computed specifier)'],
]);
const OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  customConditions: ['@ltw/source'],
};

const isTest = (file: string) => file.endsWith('.test.ts');

/** Offending imports of `text` as file `file`: raw adapter value imports or unresolvable dynamics. */
function rawImportOffenses(file: string, text: string): string[] {
  if (isTest(file) || RAW.has(file) || file === COMPOSER) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2024, true);
  const offenses: string[] = [];
  const check = (specifier: string, typeOnly: boolean) => {
    if (typeOnly) return;
    const resolved = ts.resolveModuleName(specifier, file, OPTIONS, ts.sys).resolvedModule;
    if (resolved && RAW.has(resolve(resolved.resolvedFileName))) offenses.push(specifier);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      check(node.moduleSpecifier.text, typeOnly);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      check(node.moduleSpecifier.text, node.isTypeOnly);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) check(argument.text, false);
      else offenses.push('(computed specifier)');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offenses;
}

async function sources(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist'].includes(entry.name)) found.push(...(await sources(path)));
    } else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

describe('raw adapter imports', () => {
  it('reach no module but gateway composition and tests, by resolved path', async () => {
    const offenders: string[] = [];
    for (const root of [SERVER, join(ROOT, 'scripts')]) {
      for (const file of await sources(root)) {
        const path = relative(ROOT, file).split(sep).join('/');
        for (const offense of rawImportOffenses(file, await readFile(file, 'utf8'))) {
          if (OFFLINE_TOOLS.get(path) !== offense) offenders.push(`${path}: ${offense}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the offline tools out of the application', async () => {
    const reaching: string[] = [];
    for (const file of await sources(join(ROOT, 'apps')))
      if (
        !file.endsWith('.test.ts') &&
        /from ['"][./]*scripts\//.test(await readFile(file, 'utf8'))
      )
        reaching.push(relative(ROOT, file).split(sep).join('/'));
    expect(reaching).toEqual([]);
  });

  it('catches the spellings a file-name match missed (negative controls)', () => {
    const file = join(SERVER, 'testing', 'probe.ts');
    for (const text of [
      "import { createAnthropicProvider } from '../ai/anthropic-provider.js';",
      "import { createAnthropicProvider } from '../ai/anthropic-provider.ts';",
      "export { createDeepSeekProvider } from '../ai/openai-compatible-provider.js';",
      "const m = await import('../ai/raw-provider.js');",
      "const name = 'raw-provider'; await import(`../ai/${name}.js`);",
    ]) {
      expect(rawImportOffenses(file, text), text).not.toEqual([]);
    }
    expect(
      rawImportOffenses(file, "import type { PreparedRequest } from '../ai/raw-provider.ts';"),
    ).toEqual([]);
    expect(
      rawImportOffenses(file, "import { type PreparedRequest } from '../ai/raw-provider.js';"),
    ).toEqual([]);
  });

  it('builds runtime and evaluation routers only through composition', async () => {
    const routers: string[] = [];
    for (const file of await sources(SERVER)) {
      if (isTest(file)) continue;
      if ((await readFile(file, 'utf8')).includes('new CapabilityRouter(')) {
        routers.push(relative(SERVER, file).split(sep).join('/'));
      }
    }
    // The others are test support for HTTP/UI tests, never composition.
    expect(routers.sort()).toEqual([
      'ai/composition.ts',
      'testing/ravenford-app.ts',
      'testing/scenario/session.ts',
      'testing/ui-server.ts',
    ]);
  });
});
