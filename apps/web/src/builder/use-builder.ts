import type {
  CharacterChoices,
  CharacterCreatedResponse,
  CharacterOptionsResponse,
  CharacterPreviewResponse,
  ChoiceProblem,
  CommandRejected,
} from '@ltw/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/**
 * The character builder's state (docs/adr/0056-characters-from-the-srd.md §2): what the campaign
 * offers, the choices made so far, the server's preview of them — its problems by field — and
 * the character made. The client proposes; the World Engine builds.
 */
export type Draft = Omit<CharacterChoices, 'classId' | 'speciesId' | 'backgroundId'> & {
  readonly classId: CharacterChoices['classId'] | null;
  readonly speciesId: string | null;
  readonly backgroundId: string | null;
};

export const EMPTY_DRAFT: Draft = {
  classId: null,
  speciesId: null,
  backgroundId: null,
  abilities: {
    method: 'standard-array',
    base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  },
  increases: { each: true },
  skills: [],
  moreSkills: [],
  expertise: [],
  tools: [],
  languages: [],
  equipment: { classOption: 'A', backgroundOption: 'A', picks: [] },
  invocations: [],
  weaponMasteries: [],
  cantrips: [],
  spells: [],
  spellbook: [],
};

export const choicesOf = (draft: Draft): CharacterChoices | null =>
  draft.classId === null || draft.speciesId === null || draft.backgroundId === null
    ? null
    : {
        ...draft,
        classId: draft.classId,
        speciesId: draft.speciesId,
        backgroundId: draft.backgroundId,
      };

export interface Builder {
  readonly options: CharacterOptionsResponse | null;
  readonly failed: boolean;
  readonly draft: Draft;
  readonly update: (change: Partial<Draft>) => void;
  readonly preview: CharacterPreviewResponse | null;
  /** The problems of a field and the fields under it ("equipment" holds "equipment.picks"). */
  readonly problemsOf: (field: string) => readonly ChoiceProblem[];
  readonly make: (name: string, forPlayerOf: string | null) => Promise<string | null>;
  readonly making: boolean;
  readonly refused: readonly ChoiceProblem[] | string | null;
}

export function useBuilder(api: WorldApi, open: boolean): Builder {
  const [options, setOptions] = useState<CharacterOptionsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<CharacterPreviewResponse | null>(null);
  const [making, setMaking] = useState(false);
  const [refused, setRefused] = useState<readonly ChoiceProblem[] | string | null>(null);
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open || options) return;
    const controller = new AbortController();
    api
      .get<CharacterOptionsResponse>('character-options', controller.signal, false)
      .then(setOptions)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
    };
  }, [api, open, options]);

  // The preview follows the choices, a moment after the last change.
  useEffect(() => {
    const choices = choicesOf(draft);
    if (!open || choices === null) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .post<CharacterPreviewResponse>('characters/preview', { choices }, controller.signal)
        .then(setPreview)
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, draft, open]);

  const update = useCallback((change: Partial<Draft>) => {
    setDraft((before) => ({ ...before, ...change }));
    setRefused(null);
  }, []);

  const problemsOf = useCallback(
    (field: string) =>
      (preview?.problems ?? []).filter(
        (problem) => problem.field === field || problem.field.startsWith(`${field}.`),
      ),
    [preview],
  );

  const make = useCallback(
    async (name: string, forPlayerOf: string | null): Promise<string | null> => {
      const choices = choicesOf(draft);
      if (choices === null) return null;
      setMaking(true);
      try {
        const answer = await api.post<CharacterCreatedResponse | CommandRejected>(
          'characters',
          {
            requestId: requestId.current,
            name,
            choices,
            ...(forPlayerOf === null ? {} : { forPlayerOf }),
          },
          new AbortController().signal,
        );
        if ('characterId' in answer) {
          requestId.current = crypto.randomUUID();
          return answer.characterId;
        }
        const problems = (answer.details as { problems?: ChoiceProblem[] } | undefined)?.problems;
        setRefused(problems ?? answer.message);
        return null;
      } catch {
        setRefused('The character could not be made. Try again.');
        return null;
      } finally {
        setMaking(false);
      }
    },
    [api, draft],
  );

  return { options, failed, draft, update, preview, problemsOf, make, making, refused };
}
