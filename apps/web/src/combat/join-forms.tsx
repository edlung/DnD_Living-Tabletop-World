import {
  OBJECT_MATERIALS,
  OBJECT_SIZES,
  SIDES,
  type EncounterView,
  type EntityKind,
  type EntityRef,
  type ObjectMaterial,
  type ObjectSize,
  type ScenePresentationResponse,
  type Side,
  type Square,
} from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { DmTableCommand } from '../dm/table-commands.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { MATERIAL_WORDS, SIZE_EXAMPLES } from './hit-point-words.ts';

/**
 * Joining a running fight by the DM's hand (docs/adr/0043-dm-screen.md §2): someone at the place
 * on a free square with a rolled or named initiative; or a thing at the place — a door, a chest, a
 * rope — as an object the party may break (docs/adr/0048-hit-points.md §5).
 */
interface JoinProps {
  readonly api: WorldApi;
  /** The fight: who and what joins stands at its place. */
  readonly encounter: EncounterView;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
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

/** Who or what of these kinds stands at the fight's place and is not in the fight. */
function useHere(api: WorldApi, encounter: EncounterView, kinds: readonly EntityKind[]) {
  const { locationId } = encounter;
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
  return scene.resource.status === 'ready'
    ? scene.resource.value.present.filter(
        (entity) => kinds.includes(entity.kind) && !fighting.has(entity.entityId),
      )
    : [];
}

/** A square across and down, kept as typed; its error when it is off the battlefield. */
function useSquare(t: Translate, encounter: EncounterView) {
  const spare = freeSquare(encounter);
  const [x, setX] = useState(String(spare.x));
  const [y, setY] = useState(String(spare.y));
  const square = { x: Number.parseInt(x, 10), y: Number.parseInt(y, 10) };
  const { width, height } = encounter.battlefield;
  const error =
    square.x >= 0 && square.x < width && square.y >= 0 && square.y < height
      ? null
      : t('A square on the battlefield: 0 to {width} across, 0 to {height} down.', {
          width: width - 1,
          height: height - 1,
        });
  return { x, y, setX, setY, square, error };
}

function SquareFields({
  at,
  attempted,
}: {
  readonly at: ReturnType<typeof useSquare>;
  readonly attempted: boolean;
}) {
  const t = useT();
  return (
    <>
      <Field label={t('Square across')} error={attempted ? at.error : null}>
        {(control) => (
          <input
            {...control}
            type="number"
            inputMode="numeric"
            value={at.x}
            onChange={(event) => {
              at.setX(event.target.value);
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
            value={at.y}
            onChange={(event) => {
              at.setY(event.target.value);
            }}
          />
        )}
      </Field>
    </>
  );
}

const nameOf = (t: Translate, directory: readonly EntityRef[], entityId: string) =>
  directory.find((known) => known.entityId === entityId)?.name ?? t('Stranger');

export function JoinForm({ api, encounter, directory, locked, onRun }: JoinProps) {
  const t = useT();
  const ids = useId();
  const here = useHere(api, encounter, ['creature', 'character']);
  const at = useSquare(t, encounter);
  const [who, setWho] = useState('');
  const [side, setSide] = useState<Side>('hostile');
  const [total, setTotal] = useState('');
  const [attempted, setAttempted] = useState(false);
  if (here.length === 0) return null;
  const chosen = here.some((entity) => entity.entityId === who) ? who : (here[0]?.entityId ?? '');
  const named = total.trim() === '' ? null : Number.parseInt(total, 10);
  const totalError =
    named === null || (named >= -10 && named <= 60) ? null : t('A whole number from −10 to 60.');
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (at.error || totalError || chosen === '') return;
    onRun({
      type: 'AddCombatant',
      entityId: chosen,
      side,
      position: at.square,
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
                  {nameOf(t, directory, entity.entityId)}
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
        <SquareFields at={at} attempted={attempted} />
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

/**
 * A thing at the place the party wants broken (docs/adr/0048-hit-points.md §5): what it is made of
 * and its size give its Armor Class and hit points by the SRD's tables, server-side; it takes no
 * turn.
 */
export function ObjectForm({ api, encounter, directory, locked, onRun }: JoinProps) {
  const t = useT();
  const ids = useId();
  const here = useHere(api, encounter, ['item', 'feature']);
  const at = useSquare(t, encounter);
  const [what, setWhat] = useState('');
  const [material, setMaterial] = useState<ObjectMaterial>('wood');
  const [size, setSize] = useState<ObjectSize>('medium');
  const [resilient, setResilient] = useState(true);
  const [attempted, setAttempted] = useState(false);
  if (here.length === 0) return null;
  const chosen = here.some((entity) => entity.entityId === what) ? what : (here[0]?.entityId ?? '');
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (at.error || chosen === '') return;
    onRun({
      type: 'AddObject',
      entityId: chosen,
      material,
      size,
      resilient,
      position: at.square,
    });
  };
  return (
    <form
      className="hand-form join-fight"
      noValidate
      onSubmit={submit}
      aria-labelledby={`${ids}-title`}
    >
      <h5 id={`${ids}-title`}>{t('Something to break')}</h5>
      <div className="hand-row">
        <Field label={t('What')}>
          {(control) => (
            <select
              {...control}
              value={chosen}
              onChange={(event) => {
                setWhat(event.target.value);
              }}
            >
              {here.map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {nameOf(t, directory, entity.entityId)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('Made of')}>
          {(control) => (
            <select
              {...control}
              value={material}
              onChange={(event) => {
                setMaterial(event.target.value as ObjectMaterial);
              }}
            >
              {OBJECT_MATERIALS.map((option) => (
                <option key={option} value={option}>
                  {t(MATERIAL_WORDS[option])}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="hand-row">
        <Field label={t('Size')}>
          {(control) => (
            <select
              {...control}
              value={size}
              onChange={(event) => {
                setSize(event.target.value as ObjectSize);
              }}
            >
              {OBJECT_SIZES.map((option) => (
                <option key={option} value={option}>
                  {t(SIZE_EXAMPLES[option])}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('Build')}>
          {(control) => (
            <select
              {...control}
              value={resilient ? 'resilient' : 'fragile'}
              onChange={(event) => {
                setResilient(event.target.value === 'resilient');
              }}
            >
              <option value="resilient">{t('Resilient: a door, a chest')}</option>
              <option value="fragile">{t('Fragile: a bottle, a rope')}</option>
            </select>
          )}
        </Field>
      </div>
      <div className="hand-row">
        <SquareFields at={at} attempted={attempted} />
      </div>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked}>
          <Glyph name="melee" />
          {t('Bring it into the fight')}
        </button>
      </div>
    </form>
  );
}
