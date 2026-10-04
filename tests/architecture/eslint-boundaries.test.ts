import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * Proves the import restrictions in eslint.config.js are wired to the
 * declared boundaries by linting probe sources at virtual paths.
 * Type-aware rules are disabled because the probe files do not exist on disk.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

async function restrictedImports(filePath: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
}

describe('ESLint module-boundary enforcement', () => {
  it.each([
    ['packages/domain/src/probe.ts', "import '@ltw/server';", /may depend only on/],
    ['packages/domain/src/probe.ts', "import '@ltw/rules';", /may depend only on/],
    ['packages/domain/src/probe.ts', "import 'pg';", /persistence-drivers/],
    ['packages/domain/src/probe.ts', "import '@anthropic-ai/sdk';", /ai-providers/],
    ['packages/domain/src/probe.ts', "import 'node:fs';", /server-io/],
    ['packages/rules/src/probe.ts', "import 'openai';", /ai-providers/],
    ['packages/contracts/src/probe.ts', "import '@ltw/domain';", /may depend only on/],
    ['packages/ui/src/probe.ts', "import '@ltw/domain';", /may depend only on/],
    ['apps/web/src/probe.ts', "import 'openai';", /ai-providers/],
    ['apps/web/src/probe.ts', "import '@ltw/server';", /may depend only on/],
    ['apps/server/src/probe.ts', "import '@ltw/domain/src/internal';", /public entry point/],
    ['packages/ai/src/probe.ts', "import { WorldEngine } from '@ltw/domain';", /outside tests/],
    ['packages/ai/src/probe.ts', "import { evolve } from '@ltw/domain';", /outside tests/],
    ['packages/ai/src/probe.ts', "import '@anthropic-ai/sdk';", /ai-providers/],
    ['packages/ai/src/probe.ts', "import 'node:fs';", /server-io/],
    ['packages/ai/src/probe.ts', "import 'pg';", /persistence-drivers/],
    ['packages/ai/src/probe.ts', "import '@ltw/server';", /may depend only on/],
    ['packages/ai/src/probe.ts', "import '@ltw/rules';", /may depend only on/],
    ['packages/domain/src/probe.ts', "import '@ltw/ai';", /may depend only on/],
    ['apps/web/src/probe.ts', "import '@ltw/ai';", /may depend only on/],
  ])('%s rejects %s', async (filePath, source, expected) => {
    const messages = await restrictedImports(filePath, source);

    expect(
      messages.some((message) => expected.test(message)),
      messages.join('\n'),
    ).toBe(true);
  });

  it.each([
    ['packages/rules/src/probe.ts', "import '@ltw/domain';"],
    ['packages/domain/src/probe.ts', "import '@ltw/contracts';"],
    ['apps/web/src/probe.ts', "import '@ltw/ui';"],
    ['apps/server/src/probe.ts', "import 'pg';"],
    ['apps/server/src/probe.ts', "import '@ltw/rules';"],
    ['apps/server/src/probe.ts', "import '@ltw/ai';"],
    ['packages/ai/src/probe.ts', "import { knownEntities, type WorldState } from '@ltw/domain';"],
    ['packages/ai/src/testing/probe.ts', "import { WorldEngine } from '@ltw/domain';"],
    ['packages/ai/src/probe.test.ts', "import { WorldEngine } from '@ltw/domain';"],
  ])('%s allows %s', async (filePath, source) => {
    expect(await restrictedImports(filePath, source)).toEqual([]);
  });
});
