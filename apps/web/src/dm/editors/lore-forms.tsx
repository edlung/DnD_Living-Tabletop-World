import {
  CLUE_METHODS,
  clueFits,
  type AddedFromBestiaryResponse,
  type BestiaryResponse,
  type ClueMethod,
  type CommandRejected,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useState, type SubmitEvent } from 'react';

import { useResource } from '../../api/resource.ts';
import { rejectionMessage } from '../../exploration/outcome-messages.ts';
import { Field } from '../../session/account-forms.tsx';
import { CLUE_WAYS, KNOWERS, KNOWER_WORDS, type Knower } from './editor-words.ts';
import { WhereField, type EditorProps } from './thing-forms.tsx';

/** A creature from the SRD's bestiary, named and placed outside a fight (ADR 0058 §1). */
export function CreatureForm({ api, directory, locked }: EditorProps) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<BestiaryResponse>('bestiary', signal, false),
    [api],
  );
  const bestiary = useResource('bestiary', load);
  const places = directory.filter((one) => one.kind === 'location');
  const [words, setWords] = useState('');
  const [chosen, setChosen] = useState('');
  const [name, setName] = useState('');
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const at = where === '' ? (places[0]?.entityId ?? '') : where;
  const query = words.trim().toLowerCase();
  const monsters = bestiary.resource.status === 'ready' ? bestiary.resource.value.monsters : [];
  const matches = monsters
    .filter((one) => query === '' || one.name.toLowerCase().includes(query))
    .slice(0, 40);
  const pick = matches.some((one) => one.monsterId === chosen)
    ? chosen
    : (matches[0]?.monsterId ?? '');
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pick === '' || at === '') return;
    setBusy(true);
    try {
      const added = await api.post<AddedFromBestiaryResponse | CommandRejected>(
        `bestiary/${encodeURIComponent(pick)}/add`,
        {
          requestId: crypto.randomUUID(),
          locationId: at,
          ...(name.trim() === '' ? {} : { name: name.trim() }),
        },
        AbortSignal.timeout(20_000),
      );
      const shown = name.trim() || (matches.find((one) => one.monsterId === pick)?.name ?? pick);
      setNote(
        added.status === 'rejected'
          ? rejectionMessage(t, added.code, added.message, 'CreateEntity')
          : t('{name} is in the world.', { name: t(shown) }),
      );
      if (added.status !== 'rejected') setName('');
    } catch {
      setNote(t('It could not be made. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={(event) => void submit(event)}>
      <Field label={t('Find by name')}>
        {(control) => (
          <input
            {...control}
            type="search"
            value={words}
            onChange={(event) => {
              setWords(event.target.value);
            }}
          />
        )}
      </Field>
      <Field label={t('Creature')} error={matches.length === 0 ? t('Nothing matches.') : null}>
        {(control) => (
          <select
            {...control}
            value={pick}
            onChange={(event) => {
              setChosen(event.target.value);
            }}
          >
            {matches.map((one) => (
              <option key={one.monsterId} value={one.monsterId}>
                {t('{name} · CR {cr}', { name: t(one.name), cr: one.challenge })}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('Its name (optional)')}>
        {(control) => (
          <input
            {...control}
            maxLength={60}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        )}
      </Field>
      <WhereField places={places} value={at} onChange={setWhere} />
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked || busy || pick === ''}>
          {t('Make the creature')}
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

/** A clue on a thing or a place: what it reveals and how it is found (ADR 0058 §1). */
export function ClueForm({ directory, locked, onRun }: EditorProps) {
  const t = useT();
  const things = directory.filter((one) => one.kind !== 'character');
  const [entityId, setEntityId] = useState('');
  const [method, setMethod] = useState<ClueMethod>('investigation');
  const [dc, setDc] = useState(12);
  const [statement, setStatement] = useState('');
  const [attempted, setAttempted] = useState(false);
  const on = entityId === '' ? (things[0]?.entityId ?? '') : entityId;
  // A skill check's clue lies on an object; a place or a person is looked at (ADR 0012).
  const kind = things.find((one) => one.entityId === on)?.kind;
  const ways = CLUE_METHODS.filter((one) => kind !== undefined && clueFits(kind, one));
  const way = ways.includes(method) ? method : (ways[0] ?? 'inspect');
  const checked = way === 'investigation' || way === 'perception';
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (statement.trim() === '' || on === '') return;
    onRun({
      type: 'AddClue',
      entityId: on,
      method: way,
      ...(checked ? { dc } : {}),
      statement: statement.trim(),
    });
    setStatement('');
    setAttempted(false);
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={submit}>
      <Field label={t('On what')}>
        {(control) => (
          <select
            {...control}
            value={on}
            onChange={(event) => {
              setEntityId(event.target.value);
            }}
          >
            {things.map((one) => (
              <option key={one.entityId} value={one.entityId}>
                {one.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="hand-row">
        <Field label={t('How it is found')}>
          {(control) => (
            <select
              {...control}
              value={way}
              onChange={(event) => {
                setMethod(event.target.value as ClueMethod);
              }}
            >
              {ways.map((one) => (
                <option key={one} value={one}>
                  {t(CLUE_WAYS[one])}
                </option>
              ))}
            </select>
          )}
        </Field>
        {checked && (
          <Field label={t('Difficulty (DC)')}>
            {(control) => (
              <input
                {...control}
                type="number"
                min={5}
                max={30}
                value={dc}
                onChange={(event) => {
                  setDc(Math.min(30, Math.max(5, Math.round(Number(event.target.value)) || 12)));
                }}
              />
            )}
          </Field>
        )}
      </div>
      <Field
        label={t('What it reveals')}
        error={attempted && statement.trim() === '' ? t('Say what the clue reveals.') : null}
      >
        {(control) => (
          <textarea
            {...control}
            rows={3}
            maxLength={2000}
            value={statement}
            onChange={(event) => {
              setStatement(event.target.value);
            }}
          />
        )}
      </Field>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked || on === ''}>
          {t('Leave the clue')}
        </button>
      </div>
    </form>
  );
}

/** What someone knows: the party, everyone, a character or a person of the world (ADR 0058 §1). */
export function KnowledgeForm({ directory, locked, onRun }: EditorProps) {
  const t = useT();
  const [who, setWho] = useState<Knower>('PARTY');
  const [holder, setHolder] = useState('');
  const [statement, setStatement] = useState('');
  const [about, setAbout] = useState('');
  const [attempted, setAttempted] = useState(false);
  const holders = directory.filter(
    (one) => one.kind === (who === 'CHARACTER' ? 'character' : 'npc'),
  );
  const one = holder === '' ? (holders[0]?.entityId ?? '') : holder;
  const needsHolder = who === 'CHARACTER' || who === 'NPC';
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (statement.trim() === '' || (needsHolder && one === '')) return;
    onRun({
      type: 'AddKnowledge',
      scope:
        who === 'CHARACTER'
          ? { kind: 'CHARACTER', characterId: one }
          : who === 'NPC'
            ? { kind: 'NPC', npcId: one }
            : { kind: who },
      knowledgeType: 'FACT',
      statement: statement.trim(),
      ...(about === '' ? {} : { subjects: [about] }),
      knownSince: null,
    });
    setStatement('');
    setAttempted(false);
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={submit}>
      <div className="hand-row">
        <Field label={t('Who knows it')}>
          {(control) => (
            <select
              {...control}
              value={who}
              onChange={(event) => {
                setWho(event.target.value as Knower);
                setHolder('');
              }}
            >
              {KNOWERS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(KNOWER_WORDS[kind])}
                </option>
              ))}
            </select>
          )}
        </Field>
        {needsHolder && (
          <Field label={who === 'CHARACTER' ? t('Which character') : t('Which person')}>
            {(control) => (
              <select
                {...control}
                value={one}
                onChange={(event) => {
                  setHolder(event.target.value);
                }}
              >
                {holders.map((entry) => (
                  <option key={entry.entityId} value={entry.entityId}>
                    {entry.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>
      <Field
        label={t('What they know')}
        error={attempted && statement.trim() === '' ? t('Say what they know.') : null}
      >
        {(control) => (
          <textarea
            {...control}
            rows={3}
            maxLength={2000}
            value={statement}
            onChange={(event) => {
              setStatement(event.target.value);
            }}
          />
        )}
      </Field>
      <Field label={t('About (optional)')}>
        {(control) => (
          <select
            {...control}
            value={about}
            onChange={(event) => {
              setAbout(event.target.value);
            }}
          >
            <option value="">{t('Nothing in particular')}</option>
            {directory.map((entry) => (
              <option key={entry.entityId} value={entry.entityId}>
                {entry.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked}>
          {t('Record it')}
        </button>
      </div>
    </form>
  );
}
