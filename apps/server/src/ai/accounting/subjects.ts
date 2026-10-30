import type { WorkshopAiSubject } from '@ltw/contracts';

import { AccountingRejection } from './types.ts';

export interface AccountingSubject {
  readonly campaignId: string | null;
  readonly workshopOwnerId?: string;
  readonly workshopDraftId?: string;
}

export function accountingSubjectKey(subject: AccountingSubject): string {
  if (subject.campaignId !== null) return `campaign:${subject.campaignId}`;
  if (!subject.workshopOwnerId || !subject.workshopDraftId)
    throw new AccountingRejection('INVALID_SUBJECT');
  return `workshop:${subject.workshopOwnerId}:${subject.workshopDraftId}`;
}

export function subjectColumns(campaignId: string | null, subject?: WorkshopAiSubject) {
  if (campaignId !== null && subject === undefined)
    return { kind: 'campaign', ownerId: null, draftId: null };
  if (campaignId === null && subject?.kind === 'workshop')
    return { kind: 'workshop', ownerId: subject.ownerId, draftId: subject.draftId };
  throw new AccountingRejection('INVALID_SUBJECT');
}
