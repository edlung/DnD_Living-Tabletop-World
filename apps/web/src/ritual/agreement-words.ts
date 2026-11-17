import type {
  AgreementLimit,
  AgreementRequest,
  AgreementResponse,
  AgreementTone,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * The table's agreement as a screen reads it (docs/adr/0071-memory-and-ritual.md §4): the page,
 * whether this reader said "Understood" to it as it stands, and — for the DM — who has.
 */
export function useAgreement(api: WorldApi, revision = 0) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<AgreementResponse>('agreement', signal),
    [api],
  );
  const read = useResource('agreement', load);
  useRereadOn(revision, read.reread);
  return {
    answer: read.resource.status === 'ready' ? read.resource.value : null,
    reread: read.reread,
  };
}

/** What a family table starts from: the DM changes what does not fit theirs. */
export const FAMILY_AGREEMENT: AgreementRequest = {
  tone: 'adventurous',
  toneNote: '',
  limits: ['gore', 'cruelty-to-animals', 'harm-to-children', 'torture', 'swearing'],
  alsoNot: '',
  pauseSign: '',
  ages: '',
};

/** A tone as the table says it. */
export function toneWords(t: Translate, tone: AgreementTone): string {
  switch (tone) {
    case 'cosy':
      return t('Cosy: warm, funny, nobody is in real danger');
    case 'adventurous':
      return t('Adventurous: danger and daring, and it ends well');
    case 'spooky':
      return t('Spooky: shivers and mysteries, nothing cruel');
    case 'grim':
      return t('Grim: hard choices and real losses');
  }
}

/** One thing a table may leave out of its game. */
export function limitWords(t: Translate, limit: AgreementLimit): string {
  switch (limit) {
    case 'gore':
      return t('Blood and wounds described in detail');
    case 'cruelty-to-animals':
      return t('Cruelty to animals');
    case 'harm-to-children':
      return t('Children coming to harm');
    case 'torture':
      return t('Torture');
    case 'sudden-frights':
      return t('Sudden frights');
    case 'romance':
      return t('Romance');
    case 'fights-between-players':
      return t('Players’ characters fighting each other');
    case 'swearing':
      return t('Swearing');
  }
}

const sent = (work: Promise<unknown>): Promise<boolean> =>
  work.then(
    () => true,
    () => false,
  );

/** The DM writes the page. False when it did not go through. */
export const writeAgreement = (api: WorldApi, body: AgreementRequest): Promise<boolean> =>
  sent(api.post('agreement', body, AbortSignal.timeout(20_000), true));

/** "Understood", for a character, to the page as it stands. */
export const sayUnderstood = (
  api: WorldApi,
  version: number,
  characterId: string,
): Promise<boolean> =>
  sent(
    api.post('agreement/understood', { version, characterId }, AbortSignal.timeout(20_000), true),
  );
