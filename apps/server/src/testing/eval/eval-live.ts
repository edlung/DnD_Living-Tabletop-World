import pg from 'pg';

import { AccountingTasks } from '../../ai/accounting-tasks.ts';
import { readCommitted } from '../../ai/accounting/pg-transaction.ts';
import { fixedStep } from '../../ai/accounting/deadline.ts';
import { PostgresBudgetStore } from '../../ai/accounting/postgres-budget-store.ts';
import {
  VERIFIED_CATALOG,
  configuredEntry,
  identityResolver,
  type CatalogEntry,
} from '../../ai/catalog.ts';
import { createAiGateway, type AiGateway } from '../../ai/gateway.ts';
import { PostgresAiJournal } from '../../ai/journal.ts';
import { routeIssues, type RouteProvider } from '../../platform/config/ai-routes.ts';
import { loadConfig, type AppConfig, type Env } from '../../platform/config/config.ts';
import type { Capability } from './eval-rows.ts';

/**
 * Live evaluation admission (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint C).
 * The CLI accepts only an existing approval and an operator-registered run bound to that approval
 * and to the evaluation campaign; it cannot mint a binding, change its campaign or set a ceiling.
 * Every refusal happens before a provider is constructed or a key is read, in this order:
 * `UNVERIFIED_MODEL` (no verified catalog entry), `NO_DATABASE` (none configured), `NO_KEY`,
 * `ROUTE_REFUSED` (an invalid evaluation route, before any connection), then over the database:
 * `DATABASE_UNAVAILABLE` (any failed read, never mistaken for an absent record),
 * `APPROVAL_NOT_STORED`, `RUN_NOT_REGISTERED`, `RUN_BOUND_ELSEWHERE` (another approval or
 * campaign); finally `ROUTE_REFUSED` again if composition refuses an evaluated route (`eval-run.ts`). Admission then charges every attempt to the run's evaluation bucket under the
 * approval's ceilings, in the same durable ledger as runtime (shared across models, capabilities
 * and reruns). A remote-only route per capability keeps a fallback from hiding in a measurement.
 */
export const EVAL_CAMPAIGN = 'ravenford';

export type LiveRefusal =
  | 'UNVERIFIED_MODEL'
  | 'NO_DATABASE'
  | 'NO_KEY'
  | 'DATABASE_UNAVAILABLE'
  | 'APPROVAL_NOT_STORED'
  | 'RUN_NOT_REGISTERED'
  | 'RUN_BOUND_ELSEWHERE'
  | 'ROUTE_REFUSED';

export interface LiveRequest {
  readonly approvalId: string;
  readonly runId: string;
  /** `provider:model`. */
  readonly model: string;
  readonly capabilities: readonly Capability[];
}

export interface LiveBinding {
  readonly approvalId: string;
  readonly runId: string;
  readonly campaignId: string;
  readonly entry: CatalogEntry;
  readonly model: string;
  readonly routes: Readonly<Record<string, readonly string[]>>;
  readonly config: AppConfig['ai'];
  readonly pool: pg.Pool;
}

export type Preflight =
  | { readonly ok: true; readonly binding: LiveBinding }
  | { readonly ok: false; readonly reason: LiveRefusal };

/** Variables the evaluation decides itself: runtime routes and approval are never read. */
const RUNTIME_ONLY = ['LTW_AI_ROUTES', 'LTW_AI_APPROVAL_ID'];

export interface RunRow {
  readonly approval_id: string;
  readonly campaign_id: string;
}

/** The preflight's database reads; each failure is the fixed refusal `DATABASE_UNAVAILABLE`. */
export interface PreflightReads {
  probe(pool: pg.Pool): Promise<void>;
  approvalStored(pool: pg.Pool, approvalId: string): Promise<boolean>;
  run(pool: pg.Pool, runId: string): Promise<RunRow | null>;
}

const DATABASE_READS: PreflightReads = {
  probe: async (pool) => {
    await readCommitted(pool, fixedStep(), (tx) => tx.query('SELECT 1'));
  },
  // Not `approvalExists`, which answers false on a failure: here a failure must not read as absent.
  approvalStored: (pool, approvalId) =>
    readCommitted(pool, fixedStep(), async (tx) => {
      const { rows } = await tx.query<{ stored: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM ltw_ai_approvals WHERE approval_id = $1) AS stored',
        [approvalId],
      );
      return rows[0]?.stored === true;
    }),
  run: (pool, runId) =>
    readCommitted(pool, fixedStep(), async (tx) => {
      const { rows } = await tx.query<RunRow>(
        'SELECT approval_id, campaign_id FROM ltw_ai_evaluation_runs WHERE run_id = $1',
        [runId],
      );
      return rows[0] ?? null;
    }),
};

const UNAVAILABLE = Symbol('unavailable');

/** A read's answer, or `UNAVAILABLE` when it failed. */
const attempt = async <T>(read: () => Promise<T>): Promise<T | typeof UNAVAILABLE> => {
  try {
    return await read();
  } catch {
    return UNAVAILABLE;
  }
};

export async function preflight(
  request: LiveRequest,
  env: Env,
  connect: (url: string) => pg.Pool = (url) => new pg.Pool({ connectionString: url, max: 4 }),
  reads: PreflightReads = DATABASE_READS,
): Promise<Preflight> {
  const refuse = (reason: LiveRefusal): Preflight => ({ ok: false, reason });
  const [provider = '', model = ''] = request.model.split(':');
  const entry = configuredEntry(VERIFIED_CATALOG, provider, model);
  if (entry === null) return refuse('UNVERIFIED_MODEL');
  const url = env['DATABASE_URL'];
  if (url === undefined || url.trim() === '') return refuse('NO_DATABASE');
  const config = loadConfig(
    Object.fromEntries(Object.entries(env).filter(([name]) => !RUNTIME_ONLY.includes(name))),
  );
  const keyed = new Set<RouteProvider>([
    ...(config.ai.anthropic === null ? [] : (['anthropic'] as const)),
    ...(config.ai.deepseek === null ? [] : (['deepseek'] as const)),
  ]);
  const routes = Object.fromEntries(request.capabilities.map((c) => [c, [request.model]]));
  if (!keyed.has(entry.provider)) return refuse('NO_KEY');
  if (routeIssues(routes, 'evaluation', keyed).length > 0) return refuse('ROUTE_REFUSED');

  const pool = connect(url);
  const fail = async (reason: LiveRefusal) => {
    await pool.end().catch(() => undefined);
    return refuse(reason);
  };
  if ((await attempt(() => reads.probe(pool))) === UNAVAILABLE) {
    return fail('DATABASE_UNAVAILABLE');
  }
  const stored = await attempt(() => reads.approvalStored(pool, request.approvalId));
  if (stored === UNAVAILABLE) return fail('DATABASE_UNAVAILABLE');
  if (!stored) return fail('APPROVAL_NOT_STORED');
  const run = await attempt(() => reads.run(pool, request.runId));
  if (run === UNAVAILABLE) return fail('DATABASE_UNAVAILABLE');
  if (run === null) return fail('RUN_NOT_REGISTERED');
  if (run.approval_id !== request.approvalId || run.campaign_id !== EVAL_CAMPAIGN) {
    return fail('RUN_BOUND_ELSEWHERE');
  }
  return {
    ok: true,
    binding: {
      approvalId: request.approvalId,
      runId: request.runId,
      campaignId: EVAL_CAMPAIGN,
      entry,
      model: request.model,
      routes,
      config: { ...config.ai, routes, approvalId: request.approvalId },
      pool,
    },
  };
}

/**
 * The evaluation gateway: the real composition over the shared PostgreSQL journal and budget
 * store, the journal charging the registered run (`SessionBinding` evaluation), and the given
 * transport (the CLI passes the global `fetch`; tests a fake). Null when composition refused any
 * evaluated route, in which case nothing may be measured.
 */
export function liveGateway(
  binding: LiveBinding,
  transport: typeof fetch,
  tasks: AccountingTasks = new AccountingTasks(),
): AiGateway | null {
  const gateway = createAiGateway(binding.config, {
    journal: new PostgresAiJournal(binding.pool, () => undefined, {
      class: 'evaluation',
      runId: binding.runId,
    }),
    budget: new PostgresBudgetStore(binding.pool, identityResolver(VERIFIED_CATALOG)),
    catalog: VERIFIED_CATALOG,
    approvalStored: true,
    tasks,
    fetch: transport,
  });
  const evaluated = gateway.routes.filter((route) => route.capability in binding.routes);
  return evaluated.every((route) => route.refused.length === 0 && route.providers.length === 1)
    ? gateway
    : null;
}
