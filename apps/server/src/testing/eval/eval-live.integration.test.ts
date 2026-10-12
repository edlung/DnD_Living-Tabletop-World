import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_AUTH, accountingDb, seedApproval, type AccountingDb } from '../accounting.ts';
import { fakeFetch, jsonResponse, type FetchCall } from '../fake-fetch.ts';
import { runEval, type EvalDeps } from './eval-run.ts';

/**
 * Live evaluation end to end, offline (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032,
 * checkpoint C): a throwaway database with test-fixture operator records (never an owner
 * authorization), the verified Sonnet 5.5 entry, and a fake transport answering like Sonnet 5.5.
 * Refusals without a stored approval, a registered run or a reachable database send nothing;
 * a run charges the registered evaluation run, records the evaluation session class, and writes
 * an immutable directory with model identity, charges and holds. No network, no paid call.
 */
const RUN = 'eval-run-c1';
const APPROVAL = 'eval-approval';
const CEILINGS = {
  stageMicros: 100_000_000n,
  campaignDailyMicros: 100_000_000n,
  playSessionMicros: 100_000_000n,
  evaluationRunMicros: 100_000_000n,
};
let db: AccountingDb;
const dirs: string[] = [];
beforeEach(async () => {
  db = await accountingDb();
  await seedApproval(db, {
    approvalId: APPROVAL,
    globalDailyMicros: 100_000_000n,
    ceilings: CEILINGS,
    campaignIds: ['ravenford', 'other-campaign'],
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.close();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ltw-eval-live-'));
  dirs.push(dir);
  return dir;
};

interface FakeOptions {
  /** Relevance answers without usage: an unknown charge, a held attempt. */
  readonly rankingUsage?: boolean;
  /** Usage of every intent answer (default: 1,000 input and 50 output tokens). */
  readonly intentUsage?: Readonly<Record<string, unknown>>;
  /** How the chapter is written: valid, citing no entry, or telling accounts as fact. */
  readonly chronicle?: 'valid' | 'wrong-citation' | 'missing-hedge';
}

const PLAIN_USAGE = {
  input_tokens: 1_000,
  output_tokens: 50,
  service_tier: 'standard',
  inference_geo: 'global',
};

/** Answers like Sonnet 5.5, per tool. */
function sonnet(options: FakeOptions = {}) {
  return (call: FetchCall) => {
    const body = JSON.parse(call.body) as {
      tools: { name: string }[];
      messages: { content: string }[];
    };
    const tool = body.tools[0]?.name ?? '';
    const prompt = body.messages[0]?.content ?? '';
    let input: unknown;
    let usage: Readonly<Record<string, unknown>> | undefined = PLAIN_USAGE;
    if (tool === 'propose_commands') {
      input = prompt.includes('Перемести Орина')
        ? {
            kind: 'proposal',
            proposal: {
              summary: 'Орин идёт на площадь.',
              commands: [
                { type: 'PlaceEntity', entityId: 'orin-stonebeard', locationId: 'market-square' },
              ],
            },
          }
        : { kind: 'decline', reason: prompt.includes('анекдот') ? 'not_game' : 'unsupported' };
      usage = options.intentUsage ?? PLAIN_USAGE;
    } else if (tool === 'npc_reply') input = { reply: 'Доброе утро, путник.' };
    else if (tool === 'write_chapter') {
      const keys = [...new Set(prompt.match(/\be[1-9][0-9]{0,2}\b/g) ?? [])];
      const mode = options.chronicle ?? 'valid';
      input = {
        paragraphs: keys.map((key) => ({
          text: mode === 'missing-hedge' ? 'Так всё и было.' : 'Говорят, так всё и было.',
          cites: [mode === 'wrong-citation' ? 'e99' : key],
        })),
      };
    } else {
      const keys = [...new Set(prompt.match(/\ba[1-9][0-9]{0,2}(?=:)/g) ?? [])];
      input = { ranking: keys.map((key) => ({ key, relevance: 'medium' })) };
      if (options.rankingUsage === false) usage = undefined;
    }
    return jsonResponse({
      id: `msg_${String(Math.random()).slice(2, 10)}`,
      model: 'claude-sonnet-5-5',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_1', name: tool, input }],
      ...(usage === undefined ? {} : { usage }),
    });
  };
}

const toolOf = (call: FetchCall) =>
  (JSON.parse(call.body) as { tools: { name: string }[] }).tools[0]?.name;

/** The single run directory's report and manifest. */
async function runOutput(out: string) {
  const [runDir, ...others] = await readdir(out);
  expect(others).toEqual([]);
  const dir = join(out, runDir ?? '');
  return {
    runDir: runDir ?? '',
    dir,
    report: await readFile(join(dir, 'eval-report.md'), 'utf8'),
    manifestText: await readFile(join(dir, 'manifest.json'), 'utf8'),
  };
}

function deps(fetchImpl: typeof fetch): EvalDeps & { lines: string[] } {
  const lines: string[] = [];
  return {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: db.database.url,
      ANTHROPIC_API_KEY: 'sk-test-eval-never-shown',
      LTW_AI_RELEVANCE_BUDGET_MS: '3000',
    },
    log: (line) => lines.push(line),
    now: () => new Date('2026-10-12T00:00:00Z'),
    transport: fetchImpl,
    source: () => Promise.resolve({ commit: 'c0ffee', dirty: [], dirtyListingSha256: 'e3b0' }),
    lines,
  };
}

const count = async (sql: string) => Number((await db.pool.query<{ n: string }>(sql)).rows[0]?.n);

describe('live evaluation refusals (real database)', () => {
  it.each([
    ['APPROVAL_NOT_STORED', ['--approval', 'no-such-approval', '--run', RUN], false],
    ['RUN_NOT_REGISTERED', ['--approval', APPROVAL, '--run', 'unregistered'], false],
    ['RUN_BOUND_ELSEWHERE', ['--approval', APPROVAL, '--run', 'other-run'], true],
  ] as const)('refuses with %s, sending nothing', async (reason, args, otherRun) => {
    await db.operator.registerEvaluationRun({
      runId: RUN,
      approvalId: APPROVAL,
      campaignId: 'ravenford',
      authorization: TEST_AUTH,
    });
    if (otherRun) {
      await db.operator.registerEvaluationRun({
        runId: 'other-run',
        approvalId: APPROVAL,
        campaignId: 'other-campaign',
        authorization: TEST_AUTH,
      });
    }
    const fake = fakeFetch(sonnet());
    const d = deps(fake.fetchImpl);
    expect(await runEval(['--live', ...args, '--out', await scratch()], d)).toBe(2);
    expect(d.lines).toEqual([`eval:ai refused: ${reason}`]);
    expect(fake.calls).toEqual([]);
    expect(await count('SELECT count(*) AS n FROM ltw_ai_requests')).toBe(0);
  });

  it('refuses when the database cannot be reached', async () => {
    const fake = fakeFetch(sonnet());
    const d = deps(fake.fetchImpl);
    const url = new URL(db.database.url);
    url.port = '1';
    const out = await scratch();
    const code = await runEval(['--live', '--approval', APPROVAL, '--run', RUN, '--out', out], {
      ...d,
      env: { ...d.env, DATABASE_URL: url.toString() },
    });
    expect(code).toBe(2);
    expect(d.lines).toEqual(['eval:ai refused: DATABASE_UNAVAILABLE']);
    expect(fake.calls).toEqual([]);
    expect(await readdir(out)).toEqual([]);
  });
});

describe('a registered live evaluation run over a fake Sonnet 5.5 transport', () => {
  beforeEach(async () => {
    await db.operator.registerEvaluationRun({
      runId: RUN,
      approvalId: APPROVAL,
      campaignId: 'ravenford',
      authorization: TEST_AUTH,
    });
  });

  it('charges the run under the approval and writes the run evidence', async () => {
    // Each intent answer bills 200 input, 3,000 five-minute cache-write and 800 output tokens.
    const fake = fakeFetch(
      sonnet({
        intentUsage: {
          ...PLAIN_USAGE,
          input_tokens: 200,
          output_tokens: 800,
          cache_creation_input_tokens: 3_000,
          cache_creation: { ephemeral_5m_input_tokens: 3_000, ephemeral_1h_input_tokens: 0 },
        },
      }),
    );
    const d = deps(fake.fetchImpl);
    const out = await scratch();
    expect(await runEval(['--live', '--approval', APPROVAL, '--run', RUN, '--out', out], d)).toBe(
      0,
    );
    expect(d.lines.join('\n')).not.toContain('sk-test');
    // Intents, NPC dialogue and Chronicle went to the configured model only, at their effort;
    // relevance is deterministic at runtime and is not measured unless named.
    expect(new Set(fake.calls.map(toolOf))).toEqual(
      new Set(['propose_commands', 'npc_reply', 'write_chapter']),
    );
    expect(fake.calls).toHaveLength(6 + 69 + 1);
    const efforts = new Set(
      fake.calls.map((call) => {
        const body = JSON.parse(call.body) as { model: string; output_config: { effort: string } };
        expect(body.model).toBe('claude-sonnet-5-5');
        return body.output_config.effort;
      }),
    );
    expect([...efforts].sort()).toEqual(['low', 'medium']);
    for (const call of fake.calls) expect(call.body).not.toContain('sk-test');

    // The journal recorded the evaluation session class with the run, under the approval.
    const requests = await db.pool.query<{
      session_class: string;
      session_id: string;
      approval_id: string;
    }>('SELECT DISTINCT session_class, session_id, approval_id FROM ltw_ai_requests');
    expect(requests.rows).toEqual([
      { session_class: 'evaluation', session_id: RUN, approval_id: APPROVAL },
    ]);
    const attempts = await db.pool.query<{ session_class: string; session_id: string }>(
      'SELECT DISTINCT session_class, session_id FROM ltw_ai_attempts',
    );
    expect(attempts.rows).toEqual([{ session_class: 'evaluation', session_id: RUN }]);

    const { runDir, dir, report, manifestText } = await runOutput(out);
    expect(runDir).toMatch(/^live-eval-run-c1-2026-10-12T00-00-00\.000Z-[0-9a-f]{8}$/);
    expect((await readdir(dir)).sort()).toEqual([
      'eval-report.md',
      'eval-results.json',
      'manifest.json',
    ]);
    expect(manifestText).not.toContain('sk-test');
    const manifest = JSON.parse(manifestText) as {
      charges: { knownMicros: string; heldMicros: string; openAttempts: number };
    } & Record<string, unknown>;
    expect(manifest).toMatchObject({
      mode: 'live',
      live: true,
      configuration: {
        approvalId: APPROVAL,
        runId: RUN,
        campaignId: 'ravenford',
        capabilities: ['reasoning', 'npc-dialogue', 'narrative'],
        catalog: {
          model: 'claude-sonnet-5-5',
          pricingVersion: 'anthropic-claude-sonnet-5-5-2026-10-12',
        },
      },
      modelIdentity: {
        configured: 'anthropic:claude-sonnet-5-5',
        canonical: 'claude-sonnet-5-5',
        returnedModels: ['claude-sonnet-5-5'],
      },
      knownMissingCharges: { openAttempts: 0, heldMicros: '0' },
    });
    expect(BigInt(manifest.charges.knownMicros)).toBeGreaterThan(0n);

    expect(report).toMatch(
      /Context isolation of provider input: 69 request\(s\) inspected, 0 with a forbidden item/,
    );
    expect(report).toContain(
      "Sources equal to the context builder's (ID-level): 69 of 69 checked; allowed content missing from the input: 0 request(s)",
    );
    expect(report).toMatch(
      /Technical provider success \(remote produced the accepted answer\): 69 of 69/,
    );
    // Intents: the remote proposal and its five deliberate declines; three declines were wrong.
    expect(report).toMatch(
      /Technical provider success \(remote produced the accepted answer\): 6 of 6/,
    );
    expect(report).toContain('Semantic correctness (oracle): 3 pass, 3 fail, 0 not judged of 6');
    expect(report).toContain('Safe declines (deliberate `NO_PROPOSAL`): 5');
    expect(report).toContain(
      'Chapters by authorship: model 1, model rejected (template committed) 0, template without model output 0, local 0',
    );
    expect(report).toContain('Model answers rejected by validation before commit: 0');
    // The measured intent basis is each request's known charge, cache writes included:
    // 200 × 2 + 3,000 × 2.5 + 800 × 10 = 15,900 µ$, times 5 intents.
    expect(report).toContain(
      '| reasoning | 5 | measured: known charges of 6 request(s) in this run | $0.079500 | $0.079500 |',
    );
    expect(report).toMatch(/\| fast-context \| 100 \| deterministic Context Engine/);
    expect(report).toMatch(/Alternative, not the runtime configuration: Sonnet 5\.5 relevance/);
  }, 120_000);

  it('measures relevance only on an explicitly selected route; a missing usage stays held', async () => {
    const fake = fakeFetch(sonnet({ rankingUsage: false }));
    const out = await scratch();
    expect(
      await runEval(
        ['--live', '--approval', APPROVAL, '--run', RUN, 'fast-context', '--out', out],
        deps(fake.fetchImpl),
      ),
    ).toBe(0);
    expect(fake.calls.map(toolOf)).toEqual(['rank_actions']);
    const { report, manifestText } = await runOutput(out);
    expect(JSON.parse(manifestText)).toMatchObject({
      configuration: { capabilities: ['fast-context'], relevanceBudgetMs: 3000 },
      knownMissingCharges: { openAttempts: 1, heldMicros: '2520480' },
    });
    expect(report).toContain('Effective relevance deadline (configuration): 3000 ms.');
    expect(report).toContain(
      'Outstanding holds (no terminal accounting): $2.520480 over 1 attempt',
    );
  });

  it.each([
    ['wrong-citation', 'wrong citation 2'],
    ['missing-hedge', 'missing hedge 2'],
  ] as const)(
    'reports a chapter whose model answers fail validation (%s) as a model failure',
    async (mode, causes) => {
      const fake = fakeFetch(sonnet({ chronicle: mode }));
      const out = await scratch();
      expect(
        await runEval(
          ['--live', '--approval', APPROVAL, '--run', RUN, 'narrative', '--out', out],
          deps(fake.fetchImpl),
        ),
      ).toBe(0);
      // The first answer and its one repair, both rejected before commit; the template is committed.
      expect(fake.calls.map(toolOf)).toEqual(['write_chapter', 'write_chapter']);
      const { report } = await runOutput(out);
      expect(report).toContain('Semantic correctness (oracle): 0 pass, 1 fail, 0 not judged of 1');
      expect(report).toContain(
        'Chapters by authorship: model 0, model rejected (template committed) 1, template without model output 0, local 0',
      );
      expect(report).toContain(`Model answers rejected by validation before commit: 2 (${causes})`);
      expect(report).toContain(
        'Technical provider success (remote produced the accepted answer): 0 of 1',
      );
    },
  );
});
