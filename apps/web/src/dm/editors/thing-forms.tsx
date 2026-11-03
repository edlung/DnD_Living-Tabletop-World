import {
  LOCATION_TYPES,
  type CommandRejected,
  type EntityRef,
  type LocationType,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { rejectionMessage } from '../../exploration/outcome-messages.ts';
import { Field } from '../../session/account-forms.tsx';
import type { DmTableCommand } from '../table-commands.ts';
import { PLACE_KINDS, freshId } from './editor-words.ts';

/** What every editor gets: the world the DM knows, whether a command runs, and a way to run one. */
export interface EditorProps {
  readonly api: WorldApi;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}

const placesOf = (directory: readonly EntityRef[]) =>
  directory.filter((one) => one.kind === 'location');

/** A name and words, the fields every new thing starts with. */
function useNamed() {
  const [name, setName] = useState('');
  const [words, setWords] = useState('');
  const [attempted, setAttempted] = useState(false);
  return {
    name,
    words,
    attempted,
    setAttempted,
    reset: () => {
      setName('');
      setWords('');
      setAttempted(false);
    },
    fields: (t: ReturnType<typeof useT>) => (
      <>
        <Field
          label={t('Name')}
          error={attempted && name.trim() === '' ? t('Give it a name.') : null}
        >
          {(control) => (
            <input
              {...control}
              maxLength={120}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('What it is like (optional)')}>
          {(control) => (
            <textarea
              {...control}
              rows={3}
              maxLength={4000}
              value={words}
              onChange={(event) => {
                setWords(event.target.value);
              }}
            />
          )}
        </Field>
      </>
    ),
  };
}

/** A place: its name and words, its kind and the place it lies in. */
export function PlaceForm({ directory, locked, onRun }: EditorProps) {
  const t = useT();
  const named = useNamed();
  const [kind, setKind] = useState<LocationType>('site');
  const [parentId, setParentId] = useState('');
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    named.setAttempted(true);
    if (named.name.trim() === '') return;
    onRun({
      type: 'CreateEntity',
      entityId: freshId('place'),
      kind: 'location',
      name: named.name.trim(),
      ...(named.words.trim() === '' ? {} : { description: named.words.trim() }),
      existsSince: null,
      location: { type: kind, parentId: parentId === '' ? null : parentId },
    });
    named.reset();
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={submit}>
      {named.fields(t)}
      <div className="hand-row">
        <Field label={t('Kind of place')}>
          {(control) => (
            <select
              {...control}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as LocationType);
              }}
            >
              {LOCATION_TYPES.map((one) => (
                <option key={one} value={one}>
                  {t(PLACE_KINDS[one])}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('It lies in')}>
          {(control) => (
            <select
              {...control}
              value={parentId}
              onChange={(event) => {
                setParentId(event.target.value);
              }}
            >
              <option value="">{t('No other place')}</option>
              {placesOf(directory).map((one) => (
                <option key={one.entityId} value={one.entityId}>
                  {one.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked}>
          {t('Make the place')}
        </button>
      </div>
    </form>
  );
}

/** A person of the world: an NPC with its name and words, where it is. */
export function PersonForm({ directory, locked, onRun }: EditorProps) {
  const t = useT();
  const named = useNamed();
  const places = placesOf(directory);
  const [where, setWhere] = useState('');
  const at = where === '' ? (places[0]?.entityId ?? '') : where;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    named.setAttempted(true);
    if (named.name.trim() === '' || at === '') return;
    onRun({
      type: 'CreateEntity',
      entityId: freshId('npc'),
      kind: 'npc',
      name: named.name.trim(),
      ...(named.words.trim() === '' ? {} : { description: named.words.trim() }),
      existsSince: null,
      placement: { locationId: at, since: null },
    });
    named.reset();
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={submit}>
      {named.fields(t)}
      <WhereField places={places} value={at} onChange={setWhere} />
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked || at === ''}>
          {t('Make the person')}
        </button>
      </div>
    </form>
  );
}

/** A story object: a unique thing, given to someone or left at a place. */
export function ObjectForm({ api, directory, locked }: EditorProps) {
  const t = useT();
  const named = useNamed();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const places = placesOf(directory);
  const holders = directory.filter(
    (one) => one.kind === 'character' || one.kind === 'npc' || one.kind === 'creature',
  );
  const [target, setTarget] = useState('');
  const chosen = target === '' ? (places[0]?.entityId ?? '') : target;
  const place = places.some((one) => one.entityId === chosen);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    named.setAttempted(true);
    if (named.name.trim() === '' || chosen === '') return;
    setBusy(true);
    try {
      // Made and given at once by the server: two of the DM's commands (ADR 0058 §1).
      const made = await api.post<{ status: 'made' } | CommandRejected>(
        'story-objects',
        {
          requestId: crypto.randomUUID(),
          name: named.name.trim(),
          ...(named.words.trim() === '' ? {} : { description: named.words.trim() }),
          ...(place ? { locationId: chosen } : { holderId: chosen }),
        },
        AbortSignal.timeout(20_000),
      );
      if (made.status === 'rejected') {
        setNote(rejectionMessage(t, made.code, made.message, 'CreateEntity'));
        return;
      }
      setNote(t('{name} is in the world.', { name: named.name.trim() }));
      named.reset();
    } catch {
      setNote(t('It could not be made. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={(event) => void submit(event)}>
      {named.fields(t)}
      <Field label={t('Where it is')}>
        {(control) => (
          <select
            {...control}
            value={chosen}
            onChange={(event) => {
              setTarget(event.target.value);
            }}
          >
            <optgroup label={t('Lying at a place')}>
              {places.map((one) => (
                <option key={one.entityId} value={one.entityId}>
                  {one.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('Carried by')}>
              {holders.map((one) => (
                <option key={one.entityId} value={one.entityId}>
                  {one.name}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </Field>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked || busy || chosen === ''}>
          {t('Make the object')}
        </button>
      </div>
      {note && (
        <p className="fine-print" role="status">
          {note}
        </p>
      )}
    </form>
  );
}

export function WhereField({
  places,
  value,
  onChange,
  label,
}: {
  readonly places: readonly EntityRef[];
  readonly value: string;
  readonly onChange: (placeId: string) => void;
  readonly label?: string;
}) {
  const t = useT();
  return (
    <Field label={label ?? t('Where it is')}>
      {(control) => (
        <select
          {...control}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {places.map((one) => (
            <option key={one.entityId} value={one.entityId}>
              {one.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
