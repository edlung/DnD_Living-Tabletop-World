import type { EntityRef, PresenceResponse, ScenePresentationResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { AskForCheck } from '../dice/check-forms.tsx';
import { GiveHandout } from '../handouts/handouts.tsx';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { AwardExperience } from '../builder/level-section.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { PartyCard } from './party-card.tsx';
import { ToolboxForms } from './toolbox-forms.tsx';
import type { DmTableCommand } from './table-commands.ts';

/**
 * The DM's Party sheet (docs/adr/0043-dm-screen.md §3): every character at a glance — hit points,
 * Armor Class, conditions, inspiration, passive scores, slots, death saves — with the DM's hand on
 * each, a check asked of one or of everyone, and a ruling recorded for the party. Everything goes
 * through the World Engine as the DM; the sheet follows the live signal.
 */
export function PartySheet({
  api,
  open,
  revision,
  locationId,
  directory,
  locked,
  onRun,
  onOpenSheet,
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly revision: number;
  /** What a handout may picture (ADR 0044 §5). */
  readonly directory: readonly EntityRef[];
  /** The viewed place: a ruling happens at the world time read there. */
  readonly locationId: string | null;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
  readonly onOpenSheet: (entityId: string) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PresenceResponse>('presence', signal),
    [api],
  );
  const presence = useResource('party-presence', load);
  useRereadOn(revision, presence.reread);
  if (!open) return null;
  if (presence.resource.status !== 'ready') {
    return (
      <StatusPanel
        state={presence.resource.status === 'error' ? 'error' : 'loading'}
        label={
          presence.resource.status === 'error' ? presence.resource.message : t('Reading the party…')
        }
        onRetry={presence.retry}
      />
    );
  }
  const characters = presence.resource.value.characters;
  return (
    <div className="party-sheet">
      <section className="party-cards" aria-labelledby={`${ids}-party`}>
        <h3 id={`${ids}-party`}>
          <Glyph name="party" />
          {t('The party')}
        </h3>
        {characters.length === 0 ? (
          <p className="muted">{t('No characters are at the table yet.')}</p>
        ) : (
          <ul className="party-list">
            {characters.map((entry) => (
              <PartyCard
                key={entry.character.entityId}
                api={api}
                character={entry.character}
                present={entry.present}
                revision={revision}
                locked={locked}
                onRun={onRun}
                onOpenSheet={onOpenSheet}
              />
            ))}
          </ul>
        )}
      </section>
      <div className="party-tools">
        <AwardExperience api={api} characters={characters.map((entry) => entry.character)} />
        <AskForCheck characters={characters.map((entry) => entry.character)} />
        <ToolboxForms
          characters={characters.map((entry) => entry.character)}
          locked={locked}
          onRun={onRun}
        />
        <RulingForm
          api={api}
          characters={characters.map((entry) => entry.character)}
          locationId={locationId}
          revision={revision}
          locked={locked}
          onRun={onRun}
        />
        <GiveHandout
          characters={characters.map((entry) => entry.character)}
          directory={directory}
        />
      </div>
    </div>
  );
}

/**
 * A ruling (ADR 0043 §1): what an improvised action led to, told as the party will remember it
 * (a party memory), with the DM's reason — a physical roll's result, say — kept for the history.
 */
function RulingForm({
  api,
  characters,
  locationId,
  revision,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
  readonly locationId: string | null;
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const loadScene = useCallback(
    (signal: AbortSignal) =>
      api.get<ScenePresentationResponse>(
        `locations/${encodeURIComponent(locationId ?? '')}/scene`,
        signal,
      ),
    [api, locationId],
  );
  const scene = useResource(`ruling-scene:${locationId ?? ''}`, loadScene);
  useRereadOn(revision, scene.reread);
  const [who, setWho] = useState<readonly string[]>([]);
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const worldTime = scene.resource.status === 'ready' ? scene.resource.value.worldTime : null;
  const errors = {
    who: who.length === 0 ? t('Choose whom it concerns.') : null,
    summary: summary.trim() === '' ? t('Say what happened.') : null,
    reason: reason.trim() === '' ? t('Say why, in a few words.') : null,
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (errors.who || errors.summary || errors.reason || worldTime === null) return;
    onRun({
      type: 'RecordMemory',
      scope: { kind: 'PARTY' },
      memoryKind: 'CONSEQUENCE',
      summary: summary.trim(),
      occurredAt: worldTime,
      participants: [...who],
      reason: reason.trim(),
    });
    setSummary('');
    setReason('');
    setWho([]);
    setAttempted(false);
  };
  return (
    <section className="sheet-section ruling" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Record a ruling')}</h3>
      <p className="muted">
        {t('What an improvised action led to, as the party will remember it.')}
      </p>
      <form className="hand-form" noValidate onSubmit={submit}>
        <fieldset
          className="hand-choice"
          aria-describedby={attempted && errors.who ? `${ids}-who` : undefined}
        >
          <legend>{t('Whom it concerns')}</legend>
          {characters.map((character) => (
            <label key={character.entityId}>
              <input
                type="checkbox"
                checked={who.includes(character.entityId)}
                onChange={(event) => {
                  setWho((chosen) =>
                    event.target.checked
                      ? [...chosen, character.entityId]
                      : chosen.filter((id) => id !== character.entityId),
                  );
                }}
              />
              {character.name}
            </label>
          ))}
          {attempted && errors.who && (
            <p id={`${ids}-who`} className="account-field-error">
              {errors.who}
            </p>
          )}
        </fieldset>
        <Field label={t('What happened')} error={attempted ? errors.summary : null}>
          {(control) => (
            <textarea
              {...control}
              rows={3}
              maxLength={2000}
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label={t('Why (kept in your history)')}
          hint={t('A physical roll’s result, the rule you used.')}
          error={attempted ? errors.reason : null}
        >
          {(control) => (
            <input
              {...control}
              maxLength={200}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          )}
        </Field>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={locked || worldTime === null}>
            <Glyph name="game-master" />
            {t('Record the ruling')}
          </button>
        </div>
      </form>
    </section>
  );
}
