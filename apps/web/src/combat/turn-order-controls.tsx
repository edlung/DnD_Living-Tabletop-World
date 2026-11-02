import {
  SIDES,
  type EncounterView,
  type EntityRef,
  type ScenePresentationResponse,
  type Side,
  type Square,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { DmTableCommand } from '../dm/table-commands.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { useCombatantLabels } from './labels.ts';

/**
 * The DM's hand on a running fight (docs/adr/0043-dm-screen.md §2): the turn order with each
 * combatant's initiative to set and a way out of the fight; the one whose turn it is can wait
 * until after another this round; someone at the place joins on a free square with a rolled or
 * named initiative. The World Engine decides each, as the DM.
 */
type Editing = {
  readonly kind: 'initiative' | 'remove' | 'delay';
  readonly entityId: string;
} | null;

export function TurnOrderControls({
  api,
  encounter,
  locationId,
  directory,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  /** The DM's names for who stands at the place. */
  readonly directory: readonly EntityRef[];
  /** The viewed place: who stands there may join. */
  readonly locationId: string;
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
                </span>
                <span className="action-row">
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
              {open && (
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
      <JoinForm
        api={api}
        encounter={encounter}
        locationId={locationId}
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

/** The first square no combatant stands on, from the far side of the battlefield. */
function freeSquare(encounter: EncounterView): Square {
  const { width, height } = encounter.battlefield;
  const taken = new Set(
    encounter.combatants.map((c) => `${String(c.position.x)},${String(c.position.y)}`),
  );
  for (let x = width - 1; x >= 0; x -= 1) {
    for (let y = 0; y < height; y += 1) {
      if (!taken.has(`${String(x)},${String(y)}`)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function JoinForm({
  api,
  encounter,
  locationId,
  directory,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly locationId: string;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<ScenePresentationResponse>(
        `locations/${encodeURIComponent(locationId)}/scene`,
        signal,
      ),
    [api, locationId],
  );
  const scene = useResource(`join:${locationId}`, load);
  const fighting = new Set(encounter.order);
  const here =
    scene.resource.status === 'ready'
      ? scene.resource.value.present.filter(
          (entity) =>
            (entity.kind === 'creature' || entity.kind === 'character') &&
            !fighting.has(entity.entityId),
        )
      : [];
  const spare = freeSquare(encounter);
  const [who, setWho] = useState('');
  const [side, setSide] = useState<Side>('hostile');
  const [x, setX] = useState(String(spare.x));
  const [y, setY] = useState(String(spare.y));
  const [total, setTotal] = useState('');
  const [attempted, setAttempted] = useState(false);
  if (here.length === 0) return null;
  const chosen = here.some((entity) => entity.entityId === who) ? who : (here[0]?.entityId ?? '');
  const square = { x: Number.parseInt(x, 10), y: Number.parseInt(y, 10) };
  const { width, height } = encounter.battlefield;
  const squareError =
    square.x >= 0 && square.x < width && square.y >= 0 && square.y < height
      ? null
      : t('A square on the battlefield: 0 to {width} across, 0 to {height} down.', {
          width: width - 1,
          height: height - 1,
        });
  const named = total.trim() === '' ? null : Number.parseInt(total, 10);
  const totalError =
    named === null || (named >= -10 && named <= 60) ? null : t('A whole number from −10 to 60.');
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (squareError || totalError || chosen === '') return;
    onRun({
      type: 'AddCombatant',
      entityId: chosen,
      side,
      position: square,
      ...(named === null ? {} : { initiative: named }),
    });
  };
  return (
    <form
      className="hand-form join-fight"
      noValidate
      onSubmit={submit}
      aria-labelledby={`${ids}-title`}
    >
      <h5 id={`${ids}-title`}>{t('Someone joins the fight')}</h5>
      <div className="hand-row">
        <Field label={t('Who')}>
          {(control) => (
            <select
              {...control}
              value={chosen}
              onChange={(event) => {
                setWho(event.target.value);
              }}
            >
              {here.map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {directory.find((known) => known.entityId === entity.entityId)?.name ??
                    t('Stranger')}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('Side')}>
          {(control) => (
            <select
              {...control}
              value={side}
              onChange={(event) => {
                setSide(event.target.value as Side);
              }}
            >
              {SIDES.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="hand-row">
        <Field label={t('Square across')} error={attempted ? squareError : null}>
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              value={x}
              onChange={(event) => {
                setX(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('Square down')}>
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              value={y}
              onChange={(event) => {
                setY(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label={t('Initiative total')}
          hint={t('Empty: the world rolls it.')}
          error={attempted ? totalError : null}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              value={total}
              onChange={(event) => {
                setTotal(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked}>
          <Glyph name="encounter" />
          {t('Join the fight')}
        </button>
      </div>
    </form>
  );
}
