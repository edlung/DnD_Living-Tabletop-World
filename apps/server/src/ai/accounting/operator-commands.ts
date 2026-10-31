import type pg from 'pg';

import { imageBudgetStatus, setImageCeiling } from '../../images/ledger.ts';
import { grantWorkshopPictures } from '../../images/picture-grants.ts';
import {
  ORPHAN_AFTER_MINUTES,
  openImageReservations,
  settleOrphanedReservation,
} from '../../images/ledger-operator.ts';
import type { OperatorCommand } from './operator-args.ts';
import { monetaryPolicyStatus, setMonetaryPolicy } from './monetary-policy.ts';
import { OperatorStore } from './operator-store.ts';
import { accountingStatus } from './postgres-budget-store.ts';
import { identityResolver, VERIFIED_CATALOG } from '../catalog.ts';
import { recoverIncomplete } from './recovery.ts';
import { spendReport } from './spend-report.ts';
import { explainStops } from './stop-diagnostics.ts';
import { grantPreparationApproval } from './preparation-sessions.ts';

/**
 * `pnpm ai:operator <command> …` (docs/adr/0032-live-ai.md, amendment 2026-10-11): the only
 * application path that writes accounts, approvals, evaluation-run bindings, clearances,
 * reconciliations, evidence batches and incomplete-request recovery. Its existence authorizes
 * nothing: run a mutation only with the owner's recorded spending authorization. Charge commands
 * return the IDs of any stops they appended; `stops` (read-only) explains each uncleared stop of an
 * account for the operator deciding on a clearance, and is never shown to a campaign (B2).
 * `image-budget-set` records the image ceiling (docs/adr/0035-images.md §2); `status` adds the
 * image ledger's counters, amounts included, for the operator only (startup logs keep counts).
 * `image-reservations` (read-only) lists unsettled image reservations older than the given minutes;
 * `image-reservation-settle` closes an orphaned one, whole unless an amount is given
 * (`src/images/ledger-operator.ts`, ADR 0035 amendment 2026-10-16).
 * `spend` (read-only) prints the spending counters, the AI providers' and the image ledger's with
 * its unsettled reservations (`spend-report.ts`, docs/adr/0037-deployment.md).
 * `picture-grant` enables or disables one workshop owner's paid pictures, as `preparation-grant`
 * does their text preparation (Gate 07, G07-02; migration 0024).
 */
export async function runOperatorCommand(
  pool: pg.Pool,
  command: OperatorCommand,
): Promise<unknown> {
  const operator = new OperatorStore(pool);
  switch (command.kind) {
    case 'preparation-grant':
      return { preparationGrantRevision: await grantPreparationApproval(pool, command) };
    case 'picture-grant':
      return { pictureGrantRevision: await grantWorkshopPictures(pool, command) };
    case 'monetary-policy-set':
      return {
        monetaryPolicyRevision: await setMonetaryPolicy(pool, {
          ...command.target,
          mode: command.mode,
          authorization: command.authorization,
        }),
      };
    case 'monetary-policy-status':
      return { monetaryPolicy: await monetaryPolicyStatus(pool, command.target) };
    case 'account-create':
      await operator.createAccount(command);
      return { created: command.accountId };
    case 'account-revise':
      return { revision: await operator.reviseAccount(command) };
    case 'approval-create':
      await operator.createApproval(command);
      return { created: command.approvalId };
    case 'approval-revise':
      return { revision: await operator.reviseApproval(command) };
    case 'eval-run-register':
      await operator.registerEvaluationRun(command);
      return { registered: command.runId };
    case 'stop-clear':
      await operator.clearStop(command.stopId, command.authorization);
      return { cleared: command.stopId };
    case 'attempt-reconcile':
    case 'attempt-evidence': {
      const verified =
        command.kind === 'attempt-reconcile'
          ? await operator.reconcileAttempt(command)
          : await operator.recordEvidence(command);
      return { recorded: verified.recorded, stopsAppended: verified.stops };
    }
    case 'batch-evidence': {
      const stops = await operator.recordBatchEvidence(command, command.authorization);
      return {
        recorded: command.batchId,
        attempts: command.allocations.size,
        stopsAppended: stops,
      };
    }
    case 'recover-incomplete':
      return recoverIncomplete(pool);
    case 'stops':
      return explainStops(pool, command.accountId, identityResolver(VERIFIED_CATALOG));
    case 'status':
      return { ...(await accountingStatus(pool)), images: await imageBudgetStatus(pool) };
    case 'image-budget-set':
      return {
        imageBudgetRevision: await setImageCeiling(
          pool,
          command.ceilingMicros,
          command.authorization,
        ),
      };
    case 'image-reservations':
      return {
        olderThanMinutes: command.olderThanMinutes,
        // Only reservations at least this old can be settled: a younger one may be a running job's.
        settleableAfterMinutes: ORPHAN_AFTER_MINUTES,
        reservations: await openImageReservations(pool, command.olderThanMinutes),
      };
    case 'image-reservation-settle':
      return { settled: await settleOrphanedReservation(pool, command) };
    case 'spend':
      return spendReport(pool);
  }
}
