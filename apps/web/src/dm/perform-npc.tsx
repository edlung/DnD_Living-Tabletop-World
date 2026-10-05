import type { EntityRef, NpcDialogueResponse } from '@ltw/contracts';
import { useState } from 'react';

import type { WorldApi } from '../api/client.ts';
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

/**
 * The DM performs an NPC for one of the party's characters through the existing
 * dialogue route. The World Engine decides the canonical outcome of Ask first; the
 * words that follow are table prose and never a fact.
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
  const [characterId, setCharacterId] = useState(characters[0]?.entityId ?? '');
  const [topicId, setTopicId] = useState('');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const perform = async (intent: { kind: 'talk' } | { kind: 'ask'; topicId: string }) => {
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
        new AbortController().signal,
      );
      setSaid(
        result.refused
          ? refusal(t, result.refused, npcName)
          : (result.reply?.text ??
              t(
                'No words are available for {npc} right now ({reason}). You can speak for {npc} yourself.',
                {
                  npc: npcName,
                  reason:
                    result.reply?.status === 'AI_UNAVAILABLE'
                      ? t('the voice is unavailable')
                      : t('no reply was produced'),
                },
              )),
      );
    } catch {
      setSaid(t('The conversation could not be performed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  if (characters.length === 0) return null;
  return (
    <details className="disclosure perform-npc">
      <summary>Perform {npcName} (DM)</summary>
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
          disabled={busy || characterId === ''}
          onClick={() => void perform({ kind: 'talk' })}
        >
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
            {entity.name}
          </option>
        ))}
      </select>
      <button
        disabled={busy || characterId === '' || topicId === ''}
        onClick={() => void perform({ kind: 'ask', topicId })}
      >
        {t('Answer the question')}
      </button>
      {said && (
        <blockquote role="status" aria-label={t('{npc} says', { npc: npcName })}>
          {said}
          <small>{t('Spoken, not a recorded fact.')}</small>
        </blockquote>
      )}
    </details>
  );
}
