import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { CatalogEntry } from '../../ai/catalog.ts';
import { ANTHROPIC_REQUEST_SETTINGS } from '../../ai/request-settings.ts';
import { DIALOGUE_CASES, NPC_PLACES } from './cases.ts';
import { INTENT_CASES } from './intent-cases.ts';
import type { Capability } from './eval-rows.ts';

/**
 * What an evaluation run directory states about itself (docs/STAGE_300_REMEDIATION_DESIGN.md §4;
 * ADR 0032, checkpoint C): the source it ran (commit, and every dirty file's SHA-256 with the
 * listing's own hash), its configuration without any key, and its case inventory. The blind NPC
 * comparison is recorded as waived; no blind artifact is ever produced.
 */
export const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

export interface SourceState {
  readonly commit: string | null;
  /** `sha256  path` per dirty or untracked file (`deleted` when removed), sorted by path. */
  readonly dirty: readonly string[];
  readonly dirtyListingSha256: string;
}

const run = promisify(execFile);
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** The git state of `root`; with no git, a null commit and an empty listing. */
export async function gitSourceState(root: string = REPO_ROOT): Promise<SourceState> {
  const listing = (entries: readonly string[]) =>
    sha256(entries.map((line) => `${line}\n`).join(''));
  try {
    const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const status = (
      await run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
    const paths: string[] = [];
    const fields = status.split('\0').filter((field) => field !== '');
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index] ?? '';
      paths.push(field.slice(3));
      // A rename lists its source next; the destination above is the file that exists.
      if (field[0] === 'R' || field[0] === 'C') index += 1;
    }
    const dirty = await Promise.all(
      [...new Set(paths)].sort().map(async (path) => {
        try {
          return `${sha256(await readFile(join(root, path)))}  ${path}`;
        } catch {
          return `deleted  ${path}`;
        }
      }),
    );
    return { commit, dirty, dirtyListingSha256: listing(dirty) };
  } catch {
    return { commit: null, dirty: [], dirtyListingSha256: listing([]) };
  }
}

/** The configuration as recorded: named fields only, so no key or secret can be copied in. */
export function configurationRecord(input: {
  readonly mode: 'offline' | 'live';
  readonly capabilities: readonly Capability[];
  readonly routes: Readonly<Record<string, readonly string[]>> | null;
  readonly relevanceBudgetMs: number;
  readonly requestTimeoutMs: number;
  readonly approvalId: string | null;
  readonly runId: string | null;
  readonly campaignId: string;
  readonly entry: CatalogEntry | null;
}) {
  return {
    mode: input.mode,
    capabilities: [...input.capabilities],
    routes: input.routes ?? {},
    relevanceBudgetMs: input.relevanceBudgetMs,
    requestTimeoutMs: input.requestTimeoutMs,
    approvalId: input.approvalId,
    runId: input.runId,
    campaignId: input.campaignId,
    requestSettings: input.mode === 'live' ? ANTHROPIC_REQUEST_SETTINGS : null,
    catalog:
      input.entry === null
        ? null
        : {
            provider: input.entry.provider,
            model: input.entry.model,
            pricingVersion: input.entry.pricing.version,
            verification: input.entry.verification.source,
          },
    ceilings: 'from the stored approval only (never configuration or arguments)',
  };
}

/** Every case the run may execute, by capability. */
export function caseInventory(capabilities: readonly Capability[]) {
  const all: Record<Capability, readonly string[]> = {
    reasoning: INTENT_CASES.map((c) => `${c.name} (expect ${c.expect})`),
    'npc-dialogue': Object.keys(NPC_PLACES).flatMap((npc) =>
      DIALOGUE_CASES.map((c) => `${npc}: ${c.name}`),
    ),
    narrative: ['Chapter I from the party memories'],
    'fast-context': ['rank Mira’s actions'],
  };
  return Object.fromEntries(capabilities.map((capability) => [capability, all[capability]]));
}

export const BLIND_COMPARISON =
  'waived by the owner (reviews/STAGE_300_OWNER_DECISIONS_2_2026-10-11.json: Sonnet 5.5 chosen directly for NPC voice); no blind artifact is produced';
