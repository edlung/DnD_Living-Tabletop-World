import type {
  ChronicleListResponse,
  EndingResponse,
  InventoryResponse,
  KeepsakeKind,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * A campaign's end and its heroes' keepsakes as a screen reads them
 * (docs/adr/0072-keepsakes.md §2): whether the adventure is finished, the DM's last words, what
 * each hero keeps and for whom this reader may choose. Null until read, and where a server from
 * before knows no end.
 */
export function useEnding(api: WorldApi, revision = 0) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<EndingResponse>('ending', signal).catch(() => null),
    [api],
  );
  const read = useResource('ending', load);
  useRereadOn(revision, read.reread);
  return {
    ending: read.resource.status === 'ready' ? read.resource.value : null,
    reread: read.reread,
  };
}

const sent = (write: Promise<unknown>): Promise<boolean> =>
  write.then(
    () => true,
    () => false,
  );

/** Finishes the campaign with the DM's last words, or reopens it. False when it did not go through. */
export const writeEnding = (
  api: WorldApi,
  body: { readonly finished: boolean; readonly line?: string },
): Promise<boolean> => sent(api.post('ending', body, AbortSignal.timeout(20_000), true));

/** Keeps what a hero keeps, or (`keep` null) takes it away. False when it did not go through. */
export const writeKeepsake = (
  api: WorldApi,
  body: {
    readonly characterId: string;
    readonly keep: {
      readonly kind: KeepsakeKind;
      readonly refId: string;
      readonly line: string;
    } | null;
  },
): Promise<boolean> => sent(api.post('keepsakes', body, AbortSignal.timeout(20_000), true));

export interface KeepsakeChoices {
  /** What the hero carries, named as the hero knows it. */
  readonly items: readonly { readonly id: string; readonly name: string }[];
  /** The party's chapters. */
  readonly chapters: readonly { readonly id: string; readonly name: string }[];
}

/** A choice as one control holds it: its kind, then what it names. */
export const choiceValue = (kind: KeepsakeKind, refId: string): string => `${kind}:${refId}`;
export function choiceOf(
  value: string,
): { readonly kind: KeepsakeKind; readonly refId: string } | null {
  const at = value.indexOf(':');
  const kind = value.slice(0, at);
  const refId = value.slice(at + 1);
  return (kind === 'item' || kind === 'chapter') && refId !== '' ? { kind, refId } : null;
}

/**
 * What a hero may keep: the things they carry, read in that hero's own view (the DM may take it
 * for anyone), and the chapters told from the Party. Either list may be empty; null until read.
 */
export function useKeepsakeChoices(api: WorldApi, characterId: string): KeepsakeChoices | null {
  const load = useCallback(
    async (signal: AbortSignal): Promise<KeepsakeChoices> => {
      const [carried, book] = await Promise.all([
        api
          .as(`CHARACTER:${characterId}`)
          .get<InventoryResponse>(`entities/${encodeURIComponent(characterId)}/inventory`, signal)
          .catch(() => null),
        api
          .as('PARTY')
          .get<ChronicleListResponse>('chronicle', signal)
          .catch(() => null),
      ]);
      return {
        items: (carried?.items ?? []).map((item) => ({ id: item.itemId, name: item.name })),
        chapters: (book?.chapters ?? [])
          .filter((chapter) => chapter.perspective === 'PARTY')
          .map((chapter) => ({ id: chapter.chronicleId, name: chapter.title })),
      };
    },
    [api, characterId],
  );
  const read = useResource(`keepsake-choices:${characterId}`, load);
  return read.resource.status === 'ready' ? read.resource.value : null;
}

/**
 * What a hero keeps, in words: a thing by its name, a chapter as a chapter — "keeps: Session 1:
 * Arrival" would read as two lists.
 */
export const keptWords = (t: Translate, hero: string, kind: KeepsakeKind, label: string): string =>
  kind === 'chapter'
    ? t('{hero} keeps the chapter “{what}”', { hero, what: label })
    : t('{hero} keeps: {what}', { hero, what: label });
