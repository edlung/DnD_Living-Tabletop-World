import { runCampaignPreparation } from '@ltw/ai';
import type { CampaignPreparationTraceView } from '@ltw/contracts';
import type pg from 'pg';

import type { AppConfig } from '../platform/config/config.ts';
import type { CampaignPreparationRuntime } from '../workshop/generation/runtime.ts';
import { fixedStep } from './accounting/deadline.ts';
import { readCommitted } from './accounting/pg-transaction.ts';
import {
  openPreparationSession,
  preparationApprovalAvailable,
} from './accounting/preparation-sessions.ts';
import { canonicalModel } from './catalog.ts';
import { createAiGateway, type AiGatewayOptions } from './gateway.ts';
import { PostgresAiJournal } from './journal.ts';
import { PreparationAiJournal } from './preparation-journal.ts';

export type CampaignPreparationRuntimeOptions = Omit<AiGatewayOptions, 'journal'> & {
  readonly pool: pg.Pool;
};

/** Same configured credentials/catalog/admission wrapper; a separate real journal for each job. */
export function createCampaignPreparationRuntime(
  config: AppConfig['ai'],
  options: CampaignPreparationRuntimeOptions,
): CampaignPreparationRuntime {
  const preparationConfig = {
    ...config,
    requestTimeoutMs: config.preparationTimeoutMs ?? config.requestTimeoutMs,
  };
  const discovery = createAiGateway(preparationConfig, {
    ...options,
    journal: new PostgresAiJournal(options.pool),
  });
  const names =
    discovery.routes.find((route) => route.capability === 'campaign-preparation')?.providers ?? [];
  const [name] = names;
  const [provider = '', model = ''] = name?.split(':') ?? [];
  const approvalId = config.approvalId;
  const configured =
    names.length === 1 &&
    name !== 'local' &&
    provider !== '' &&
    model !== '' &&
    approvalId !== null;
  const availability: CampaignPreparationRuntime['availability'] = async (ownerId) => {
    if (!configured) return { available: false, reason: 'NO_ROUTE', providers: [] };
    try {
      const available = await readCommitted(options.pool, fixedStep(), async (tx) => {
        await tx.policy('shared');
        return preparationApprovalAvailable(tx, ownerId, approvalId);
      });
      return {
        available,
        reason: available ? 'READY' : 'NO_PREPARATION_GRANT',
        providers: [name ?? ''],
      };
    } catch {
      return { available: false, reason: 'UNAVAILABLE', providers: [] };
    }
  };
  return {
    availability,
    forJob: async (binding) => {
      if (!(await availability(binding.ownerId)).available || approvalId === null) return null;
      const sessionId = await openPreparationSession(options.pool, binding, approvalId);
      if (sessionId === null) return null;
      const journal = new PreparationAiJournal(options.pool, binding, sessionId, approvalId);
      const gateway = createAiGateway(preparationConfig, { ...options, journal });
      return {
        provider,
        model,
        run: async (input) => {
          const result = await runCampaignPreparation(gateway, {
            ...input,
            sessionId,
            ownerId: binding.ownerId,
            draftId: binding.draftId,
            jobId: binding.jobId,
          });
          return {
            ...result,
            model:
              result.model !== null &&
              result.provider !== null &&
              canonicalModel(options.catalog, result.provider, result.model, null) === model
                ? model
                : result.model,
          };
        },
      };
    },
    trace: async (ownerId, draftId, traceId) => {
      const result = await options.pool.query<{ trace: CampaignPreparationTraceView }>(
        `SELECT trace FROM ltw_ai_traces WHERE subject_kind='workshop'
         AND workshop_owner_id=$1::uuid AND workshop_draft_id=$2::uuid AND trace_id=$3`,
        [ownerId, draftId, traceId],
      );
      return result.rows[0]?.trace ?? null;
    },
  };
}
