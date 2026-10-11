import type pg from 'pg';

import type { OperatorCommand } from './operator-args.ts';
import { OperatorStore } from './operator-store.ts';
import { accountingStatus } from './postgres-budget-store.ts';
import { recoverIncomplete } from './recovery.ts';

/**
 * `pnpm ai:operator <command> …` (docs/adr/0032-live-ai.md, amendment 2026-10-11): the only
 * application path that writes accounts, approvals, evaluation-run bindings, clearances,
 * reconciliations, evidence batches and incomplete-request recovery. Its existence authorizes
 * nothing: run a mutation only with the owner's recorded spending authorization.
 */
export async function runOperatorCommand(
  pool: pg.Pool,
  command: OperatorCommand,
): Promise<unknown> {
  const operator = new OperatorStore(pool);
  switch (command.kind) {
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
      return { recorded: await operator.reconcileAttempt(command) };
    case 'attempt-evidence':
      await operator.recordEvidence(command);
      return { recorded: 'evidence' };
    case 'batch-evidence':
      await operator.recordBatchEvidence(command, command.authorization);
      return { recorded: command.batchId, attempts: command.allocations.size };
    case 'recover-incomplete':
      return recoverIncomplete(pool);
    case 'status':
      return accountingStatus(pool);
  }
}
