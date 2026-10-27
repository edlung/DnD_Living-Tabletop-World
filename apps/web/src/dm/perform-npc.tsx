import type { EntityRef, NpcDialogueResponse } from '@ltw/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { distinctNames } from '../world/entity-words.ts';
import { useT, type Translate } from '@ltw/ui';

function refusal(t: Translate, code: string, npc: string): string {
  if (code === 'NOT_PRESENT') {
    return t(
      '{npc} is not in the same place as this character. Move the character to {npc}, or {npc} to them, first.',
      { npc },
    );
  }
  if (code === 'ACTOR_DEAD' || code === 'ACTOR_INCAPACITATED') {
    return t('This character cannot speak right now.');
  }
  if (code === 'TARGET_DEAD') return t('{npc} cannot answer.', { npc });
  return t('{npc} cannot speak with this character now ({reason}).', {
    npc,
    reason: t(code.replaceAll('_', ' ').toLowerCase()),
  });
}

/** What came back from performing an NPC: its words, or a message about why none came. */
export interface PerformAnswerState {
  readonly text: string;
  readonly spoken: boolean;
}

/**
 * The answer, honestly framed (ADR 0032, C): spoken words are the NPC's — "{npc} says", with
 * the reminder that they are not a recorded fact; a refusal, "no words are available" or a
 * failure is a plain status in the panel's own voice, never presented as the NPC speaking.
 */
export function PerformAnswer({
  npcName,
  said,
}: {
  readonly npcName: string;
  readonly said: PerformAnswerState;
}) {
  const t = useT();
  // Each answer comes into view where it appears (a phone's panel scrolls).
  const shown = useCallback((element: HTMLElement | null) => {
    element?.scrollIntoView({ block: 'nearest' });
  }, []);
  return said.spoken ? (
    <blockquote
      ref={shown}
      className="perform-said"
      role="status"
      aria-label={t('{npc} says', { npc: npcName })}
    >
      {said.text}
      <small>{t('Spoken, not a recorded fact.')}</small>
    </blockquote>
  ) : (
    <p ref={shown} className="perform-said perform-said--message" role="status">
      {said.text}
    </p>
  );
}

/**
 * The DM performs an NPC for one of the party's characters through the existing
 * dialogue route. The World Engine decides the canonical outcome of Ask first; the
 * words that follow are table prose and never a fact. While a (possibly live) reply is
 * awaited the panel says so; a reply for another NPC or character, or one arriving after
 * the panel closed, is discarded (ADR 0032, C). The DM's line is kept as a draft.
 */
export function PerformNpc({
  api,
  npcId,
  npcName,
  directory,
}: {
  readonly api: WorldApi;
  readonly npcId: string;
  readonly npcName: string;
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const characters = directory.filter((entity) => entity.kind === 'character');
  const topics = directory.filter((entity) => entity.entityId !== npcId);
  const names = distinctNames(t, directory);
  const [characterId, setCharacterId] = useState(characters[0]?.entityId ?? '');
  const [topicId, setTopicId] = useState('');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  // What came back: the NPC's words, or a message about why none came (never shown as speech).
  const [said, setSaid] = useState<PerformAnswerState | null>(null);
  // The one request whose answer may still be shown; replaced when the NPC or character changes.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setSaid(null);
    setBusy(false);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [npcId, characterId]);
  const perform = async (intent: { kind: 'talk' } | { kind: 'ask'; topicId: string }) => {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    const current = () => pending.current === request && !request.signal.aborted;
    setBusy(true);
    setSaid(null);
    try {
      const body = {
        characterId,
        intent,
        ...(line.trim() === '' ? {} : { line: line.trim() }),
      };
      const result = await api.post<NpcDialogueResponse>(
        `npcs/${encodeURIComponent(npcId)}/dialogue`,
        body,
        request.signal,
      );
      if (!current()) return;
      const words = result.refused ? null : (result.reply?.text ?? null);
      setSaid(
        words !== null
          ? { text: words, spoken: true }
          : {
              spoken: false,
              text: result.refused
                ? refusal(t, result.refused, npcName)
                : t(
                    'No words are available for {npc} right now ({reason}). You can speak for {npc} yourself.',
                    {
                      npc: npcName,
                      reason:
                        result.reply?.status === 'AI_UNAVAILABLE'
                          ? t('the voice is unavailable')
                          : t('no reply was produced'),
                    },
                  ),
            },
      );
    } catch {
      if (current()) {
        setSaid({
          text: t('The conversation could not be performed. Please try again.'),
          spoken: false,
        });
      }
    } finally {
      if (current()) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  if (characters.length === 0) return null;
  return (
    <details className="disclosure perform-npc">
      <summary>
        <Glyph name="perform" />
        {t('Perform {npc} (DM)', { npc: npcName })}
      </summary>
      <div className="perform-body">
        <label htmlFor="perform-character">{t('Speaking with')}</label>
        <select
          id="perform-character"
          value={characterId}
          onChange={(event) => {
            setCharacterId(event.target.value);
          }}
        >
          {characters.map((entity) => (
            <option key={entity.entityId} value={entity.entityId}>
              {entity.name}
            </option>
          ))}
        </select>
        <label htmlFor="perform-line">{t('What the character says (optional)')}</label>
        <p className="muted">
          {t('Given to the NPC as context for the reply; it never changes the world.')}
        </p>
        <textarea
          id="perform-line"
          value={line}
          onChange={(event) => {
            setLine(event.target.value);
          }}
        />
        <div className="action-row">
          <button
            className="primary-button"
            disabled={busy || characterId === ''}
            onClick={() => void perform({ kind: 'talk' })}
          >
            <Glyph name="talk" />
            {t('Speak as {npc}', { npc: npcName })}
          </button>
        </div>
        <label htmlFor="perform-topic">{t('Ask about')}</label>
        <select
          id="perform-topic"
          value={topicId}
          onChange={(event) => {
            setTopicId(event.target.value);
          }}
        >
          <option value="">{t('Choose a subject')}</option>
          {topics.map((entity) => (
            <option key={entity.entityId} value={entity.entityId}>
              {names.get(entity.entityId) ?? entity.name}
            </option>
          ))}
        </select>
        <button
          disabled={busy || characterId === '' || topicId === ''}
          onClick={() => void perform({ kind: 'ask', topicId })}
        >
          <Glyph name="ask" />
          {t('Answer the question')}
        </button>
        {busy && (
          <p role="status" className="muted">
            {t('{npc} is replying…', { npc: npcName })}
          </p>
        )}
        {said && <PerformAnswer npcName={npcName} said={said} />}
      </div>
    </details>
  );
}
