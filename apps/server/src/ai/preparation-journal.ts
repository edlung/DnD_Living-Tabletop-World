import type { AiRequestStart, RequestDeadline } from '@ltw/ai';
import type pg from 'pg';

import { storageStep } from './accounting/deadline.ts';
import { readCommitted } from './accounting/pg-transaction.ts';
import {
  preparationSessionEligible,
  type PreparationJobBinding,
} from './accounting/preparation-sessions.ts';
import { startRequest } from './accounting/request-journal.ts';
import { PostgresAiJournal, type RouteIdentity } from './journal.ts';
import type { AccountingIssue } from './accounting-tasks.ts';

/** A job-bound journal cannot convert another capability or identity into preparation. */
export class PreparationAiJournal extends PostgresAiJournal {
  readonly #pool: pg.Pool;
  readonly #binding: PreparationJobBinding;
  readonly #sessionId: string;
  readonly #approvalId: string;

  constructor(
    pool: pg.Pool,
    binding: PreparationJobBinding,
    sessionId: string,
    approvalId: string,
    report: (issue: AccountingIssue) => void = () => undefined,
  ) {
    super(pool, report);
    this.#pool = pool;
    this.#binding = binding;
    this.#sessionId = sessionId;
    this.#approvalId = approvalId;
  }

  override async begin(
    start: AiRequestStart,
    identity: RouteIdentity,
    deadline: RequestDeadline,
  ): Promise<boolean> {
    const binding = this.#binding;
    if (
      start.capability !== 'campaign-preparation' ||
      start.purpose !== 'campaign-preparation' ||
      start.campaignId !== null ||
      start.actorId !== binding.ownerId ||
      start.subject?.kind !== 'workshop' ||
      start.subject.ownerId !== binding.ownerId ||
      start.subject.draftId !== binding.draftId ||
      start.sessionId !== this.#sessionId ||
      !start.sourceIds.includes(binding.jobId) ||
      identity.approvalId !== this.#approvalId
    )
      return false;
    const eligible = await readCommitted(
      this.#pool,
      storageStep({ atMs: deadline.atMs }),
      async (tx) => {
        await tx.policy('shared');
        return preparationSessionEligible(
          tx,
          this.#sessionId,
          binding.ownerId,
          binding.draftId,
          this.#approvalId,
        );
      },
    );
    if (!eligible) return false;
    return (
      (
        await startRequest(
          this.#pool,
          {
            requestId: start.requestId,
            campaignId: null,
            subject: start.subject,
            actorId: start.actorId,
            purpose: start.purpose,
            capability: start.capability,
            scope: start.scope,
            sourceIds: start.sourceIds,
            approvalId: this.#approvalId,
            configuredModel: identity.configuredModel,
            session: { class: 'preparation', sessionId: this.#sessionId },
          },
          { atMs: deadline.atMs },
        )
      ).status === 'started'
    );
  }
}
