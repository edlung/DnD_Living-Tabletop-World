import type { EncounterView, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { ConditionForm } from '../dm/condition-form.tsx';
import type { DmTableCommand } from '../dm/table-commands.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { objectWords } from './hit-point-words.ts';
import { JoinForm, ObjectForm } from './join-forms.tsx';
import { useCombatantLabels } from './labels.ts';

/**
 * The DM's hand on a running fight (docs/adr/0043-dm-screen.md §2): the turn order with each
 * combatant's initiative to set, its conditions (ADR 0045) and a way out of the fight; the one whose turn it is can wait
 * until after another this round; someone at the place joins on a free square with a rolled or
 * named initiative. The World Engine decides each, as the DM.
 */
type Editing = {
  readonly kind: 'initiative' | 'remove' | 'delay' | 'conditions';
  readonly entityId: string;
} | null;

export function TurnOrderControls({
  api,
  encounter,
  directory,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  /** The DM's names for who stands at the place. */
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const labelOf = useCombatantLabels(encounter);
  const [editing, setEditing] = useState<Editing>(null);
  const [value, setValue] = useState('');
  const send = (command: DmTableCommand) => {
    setEditing(null);
    setValue('');
    onRun(command);
  };
  const later = encounter.order.slice(encounter.order.indexOf(encounter.currentCombatantId) + 1);
  // The party's characters in the fight: each may command a creature (ADR 0044 §7).
  const commanders = encounter.combatants.filter((c) => c.entity.kind === 'character');
  return (
    <section className="tool-card turn-order-tools" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>
        <Glyph name="initiative" />
        {t('Turn order')}
      </h4>
      <ol className="turn-order">
        {encounter.order.map((entityId) => {
          const combatant = encounter.combatants.find((c) => c.entity.entityId === entityId);
          if (!combatant) return null;
          const name = labelOf(entityId);
          const current = entityId === encounter.currentCombatantId;
          const open = editing?.entityId === entityId ? editing.kind : null;
          return (
            <li key={entityId} className={current ? 'is-current' : undefined}>
              <div className="turn-order-row">
                <span className="turn-order-total">{combatant.initiative?.total ?? '–'}</span>
                <span className="turn-order-name">
                  {name}
                  {current && <span className="status-pill">{t('Now')}</span>}
                  {combatant.initiative?.surprised && (
                    <small className="turn-order-note">{t('surprised')}</small>
                  )}
                  {/* An object takes no turn (docs/adr/0048-hit-points.md §5). */}
                  {combatant.object && (
                    <small className="turn-order-note">{objectWords(t, combatant.object)}</small>
                  )}
                </span>
                <span className="action-row">
                  {!combatant.object && (
                    <button
                      type="button"
                      aria-expanded={open === 'initiative'}
                      aria-label={t('Initiative of {name}', { name })}
                      onClick={() => {
                        setValue(String(combatant.initiative?.total ?? ''));
                        setEditing(open === 'initiative' ? null : { kind: 'initiative', entityId });
                      }}
                    >
                      {t('Initiative')}
                    </button>
                  )}
                  {current && later.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={open === 'delay'}
                      onClick={() => {
                        setValue(later[0] ?? '');
                        setEditing(open === 'delay' ? null : { kind: 'delay', entityId });
                      }}
                    >
                      {t('Delay the turn')}
                    </button>
                  )}
                  {/* A creature a party character commands (ADR 0044 §7): its player runs it. */}
                  {combatant.entity.kind !== 'character' &&
                    !combatant.object &&
                    commanders.length > 0 && (
                      <select
                        aria-label={t('Who runs {name}', { name })}
                        value={combatant.commandedBy?.entityId ?? ''}
                        disabled={locked}
                        onChange={(event) => {
                          send({
                            type: 'CommandCreature',
                            combatantId: entityId,
                            characterId: event.target.value === '' ? null : event.target.value,
                          });
                        }}
                      >
                        <option value="">{t('The DM')}</option>
                        {commanders.map((commander) => (
                          <option key={commander.entity.entityId} value={commander.entity.entityId}>
                            {t('Player of {name}', { name: labelOf(commander.entity.entityId) })}
                          </option>
                        ))}
                      </select>
                    )}
                  {/* Any creature's conditions, by the DM's hand (ADR 0045 §1–2). */}
                  {!combatant.object && (
                    <button
                      type="button"
                      aria-expanded={open === 'conditions'}
                      aria-label={t('Conditions of {name}', { name })}
                      onClick={() => {
                        setEditing(open === 'conditions' ? null : { kind: 'conditions', entityId });
                      }}
                    >
                      {t('Conditions')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="quiet-button"
                    aria-expanded={open === 'remove'}
                    aria-label={t('Take {name} out of the fight', { name })}
                    onClick={() => {
                      setValue('');
                      setEditing(open === 'remove' ? null : { kind: 'remove', entityId });
                    }}
                  >
                    {t('Out of the fight')}
                  </button>
                </span>
              </div>
              {open === 'conditions' && (
                <ConditionForm
                  targetId={entityId}
                  name={name}
                  conditions={combatant.conditions}
                  exhaustion={combatant.exhaustion ?? 0}
                  fight={encounter.order.map((id) => ({ entityId: id, name: labelOf(id) }))}
                  locked={locked}
                  onSend={send}
                  onCancel={() => {
                    setEditing(null);
                  }}
                />
              )}
              {open && open !== 'conditions' && (
                <RowForm
                  kind={open}
                  name={name}
                  value={value}
                  later={later.map((id) => ({ id, name: labelOf(id) }))}
                  locked={locked}
                  onValue={setValue}
                  onCancel={() => {
                    setEditing(null);
                  }}
                  onSubmit={() => {
                    if (open === 'initiative') {
                      send({ type: 'SetInitiative', combatantId: entityId, total: Number(value) });
                    } else if (open === 'delay') {
                      send({ type: 'DelayTurn', combatantId: entityId, afterId: value });
                    } else {
                      send({ type: 'RemoveCombatant', entityId, reason: value.trim() });
                    }
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
      {/* Who and what stands at the fight's place may join it. */}
      <JoinForm
        api={api}
        encounter={encounter}
        directory={directory}
        locked={locked}
        onRun={send}
      />
      <ObjectForm
        api={api}
        encounter={encounter}
        directory={directory}
        locked={locked}
        onRun={send}
      />
    </section>
  );
}

function RowForm({
  kind,
  name,
  value,
  later,
  locked,
  onValue,
  onCancel,
  onSubmit,
}: {
  readonly kind: 'initiative' | 'remove' | 'delay';
  readonly name: string;
  readonly value: string;
  readonly later: readonly { readonly id: string; readonly name: string }[];
  readonly locked: boolean;
  readonly onValue: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  const t = useT();
  const [attempted, setAttempted] = useState(false);
  const total = Number.parseInt(value, 10);
  const error =
    kind === 'initiative' && !(total >= -10 && total <= 60)
      ? t('A whole number from −10 to 60.')
      : kind === 'remove' && value.trim() === ''
        ? t('Say why, in a few words.')
        : null;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (error === null) onSubmit();
  };
  return (
    <form className="hand-form turn-order-form" noValidate onSubmit={submit}>
      <Field
        label={
          kind === 'initiative'
            ? t('Initiative total of {name}', { name })
            : kind === 'delay'
              ? t('{name} acts after', { name })
              : t('Why (kept in your history)')
        }
        error={attempted ? error : null}
      >
        {(control) =>
          kind === 'delay' ? (
            <select
              {...control}
              value={value}
              onChange={(event) => {
                onValue(event.target.value);
              }}
            >
              {later.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              {...control}
              {...(kind === 'initiative'
                ? { type: 'number', inputMode: 'numeric' as const, min: -10, max: 60 }
                : { maxLength: 200 })}
              value={value}
              onChange={(event) => {
                onValue(event.target.value);
              }}
            />
          )
        }
      </Field>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked}>
          {kind === 'initiative'
            ? t('Set the initiative')
            : kind === 'delay'
              ? t('Delay the turn')
              : t('Take out of the fight')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
