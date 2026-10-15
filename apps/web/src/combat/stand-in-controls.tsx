import {
  SUBSTITUTION_NOTE_CHARS,
  SUBSTITUTION_REASONS,
  type EncounterView,
  type PresenceResponse,
  type SubstitutionReason,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { REASON_TEXT } from '../dm/history-text.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { standInChoices, standInReason, type StandIn, type StandInChoice } from './stand-in.ts';

/**
 * The DM's choice for an absent player (docs/adr/0033-live-session.md §6; design §B): skip the
 * turn (the existing End turn) or act as the character with its own combat actions and
 * reactions. Either asks why first; the reason is recorded with each command. Presence is
 * shown beside the name and decides nothing. DM perspective only.
 */
export function StandInControls({
  api,
  encounter,
  locked,
  onRun,
  onActAs,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onActAs: (standIn: StandIn) => void;
}) {
  const t = useT();
  const [pending, setPending] = useState<
    (StandInChoice & { readonly action: 'skip' | 'act' }) | null
  >(null);
  const [reason, setReason] = useState<SubstitutionReason | null>(null);
  const [note, setNote] = useState('');
  const loadPresence = useCallback(
    (signal: AbortSignal) => api.get<PresenceResponse>('presence', signal),
    [api],
  );
  const { resource: presence } = useResource('stand-in-presence', loadPresence);
  const choices = standInChoices(encounter);
  if (choices.length === 0) return null;
  const connected = (characterId: string) =>
    presence.status === 'ready'
      ? presence.value.characters.find((entry) => entry.character.entityId === characterId)?.present
      : undefined;
  const ask = (choice: StandInChoice, action: 'skip' | 'act') => {
    setPending({ ...choice, action });
    setReason(null);
    setNote('');
  };
  const confirm = () => {
    if (!pending || reason === null) return;
    const standIn: StandIn = {
      characterId: pending.characterId,
      name: pending.name,
      reason,
      note: note.trim() === '' ? null : note.trim(),
    };
    setPending(null);
    if (pending.action === 'act') {
      onActAs(standIn);
      return;
    }
    onRun({
      kind: 'command',
      command: { type: 'EndTurn', combatantId: standIn.characterId },
      standIn: standInReason(standIn),
    });
  };
  return (
    <section className="stand-in" aria-label={t('Act for a player')}>
      <p className="muted">
        {t('Presence is shown for information only. Whether a player is away is your call.')}
      </p>
      {choices.map((choice) => {
        const present = connected(choice.characterId);
        return (
          <div key={choice.characterId} className="stand-in-choice">
            <p>
              <strong>{choice.name}</strong>
              {present !== undefined && (
                <span className="muted">
                  {' '}
                  · {present ? t('Player connected') : t('Player not connected')}
                </span>
              )}
            </p>
            <div className="action-row">
              {choice.current && (
                <button
                  disabled={locked}
                  onClick={() => {
                    ask(choice, 'skip');
                  }}
                >
                  {t('Skip the turn')}
                </button>
              )}
              <button
                disabled={locked}
                onClick={() => {
                  ask(choice, 'act');
                }}
              >
                {t('Act as {name}', { name: choice.name })}
              </button>
            </div>
          </div>
        );
      })}
      {pending && (
        <form
          className="stand-in-reason"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <fieldset>
            <legend>
              {pending.action === 'skip'
                ? t('Why skip the turn of {name}?', { name: pending.name })
                : t('Why act as {name}?', { name: pending.name })}
            </legend>
            {SUBSTITUTION_REASONS.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="stand-in-reason"
                  value={option}
                  checked={reason === option}
                  onChange={() => {
                    setReason(option);
                  }}
                />{' '}
                {t(REASON_TEXT[option])}
              </label>
            ))}
          </fieldset>
          <label htmlFor="stand-in-note">{t('Note for the history (optional)')}</label>
          <input
            id="stand-in-note"
            maxLength={SUBSTITUTION_NOTE_CHARS}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <div className="action-row">
            <button type="submit" disabled={locked || reason === null}>
              {pending.action === 'skip'
                ? t('Skip the turn of {name}', { name: pending.name })
                : t('Start acting as {name}', { name: pending.name })}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
