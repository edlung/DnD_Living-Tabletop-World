import type { EntityRef, ProposableCommand } from '@ltw/contracts';
import { useState } from 'react';
import { useT } from '@ltw/ui';

type Create = Extract<ProposableCommand, { type: 'CreateEntity' }>;
type Know = Extract<ProposableCommand, { type: 'AddKnowledge' }>;

/**
 * The editable shape of a proposed NPC: name, description, place, what they
 * saw, and whether they will tell. `null` for any other proposal, which the DM
 * changes by describing it again. Edits become commands of a new revision.
 */
export function editableNpc(commands: readonly ProposableCommand[]) {
  const create = commands.find(
    (command): command is Create => command.type === 'CreateEntity' && command.kind === 'npc',
  );
  if (!create) return null;
  const record = commands.find(
    (command): command is Know =>
      command.type === 'AddKnowledge' &&
      command.scope.kind === 'NPC' &&
      command.scope.npcId === create.entityId,
  );
  const willing = commands.some(
    (command) =>
      command.type === 'SetDisclosure' &&
      command.knowledgeId === record?.knowledgeId &&
      command.disclosure === 'WILLING',
  );
  return { create, record, willing };
}

export function applyNpcEdit(
  commands: readonly ProposableCommand[],
  edit: {
    readonly name: string;
    readonly description: string;
    readonly locationId: string;
    readonly statement: string;
    readonly willing: boolean;
  },
): ProposableCommand[] {
  const npc = editableNpc(commands);
  if (!npc) return [...commands];
  const rest = commands
    .filter(
      (command) =>
        !(command.type === 'SetDisclosure' && command.knowledgeId === npc.record?.knowledgeId),
    )
    .map((command): ProposableCommand => {
      if (command === npc.create) {
        return {
          ...npc.create,
          name: edit.name.trim(),
          description: edit.description.trim(),
          placement: { locationId: edit.locationId, since: npc.create.placement?.since ?? null },
        };
      }
      if (command === npc.record) return { ...npc.record, statement: edit.statement.trim() };
      return command;
    });
  const id = npc.record?.knowledgeId;
  return edit.willing && id !== undefined
    ? [...rest, { type: 'SetDisclosure', knowledgeId: id, disclosure: 'WILLING' }]
    : rest;
}

export function ProposalEditor({
  commands,
  locations,
  busy,
  onApply,
}: {
  readonly commands: readonly ProposableCommand[];
  readonly locations: readonly EntityRef[];
  readonly busy: boolean;
  readonly onApply: (commands: readonly ProposableCommand[]) => void;
}) {
  const t = useT();
  const npc = editableNpc(commands);
  const [name, setName] = useState(npc?.create.name ?? '');
  const [description, setDescription] = useState(npc?.create.description ?? '');
  const [locationId, setLocationId] = useState(npc?.create.placement?.locationId ?? '');
  const [statement, setStatement] = useState(npc?.record?.statement ?? '');
  const [willing, setWilling] = useState(npc?.willing ?? false);
  if (!npc) {
    return (
      <p className="muted">
        {t('This kind of proposal cannot be edited here. Describe it differently to try again.')}
      </p>
    );
  }
  const valid = name.trim() !== '' && description.trim() !== '' && locationId !== '';
  return (
    <form
      className="proposal-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid)
          onApply(applyNpcEdit(commands, { name, description, locationId, statement, willing }));
      }}
    >
      <label htmlFor="edit-name">{t('Name')}</label>
      <input
        id="edit-name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <label htmlFor="edit-description">{t('Description')}</label>
      <textarea
        id="edit-description"
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />
      <label htmlFor="edit-location">{t('Where they stand')}</label>
      <select
        id="edit-location"
        value={locationId}
        onChange={(event) => {
          setLocationId(event.target.value);
        }}
      >
        {locations.map((place) => (
          <option key={place.entityId} value={place.entityId}>
            {place.name}
          </option>
        ))}
      </select>
      {npc.record && (
        <>
          <label htmlFor="edit-statement">{t('What they saw or know')}</label>
          <textarea
            id="edit-statement"
            value={statement}
            onChange={(event) => {
              setStatement(event.target.value);
            }}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={willing}
              onChange={(event) => {
                setWilling(event.target.checked);
              }}
            />{' '}
            {t('Willing to tell this when asked')}
          </label>
        </>
      )}
      <button type="submit" disabled={busy || !valid}>
        {t('Apply changes')}
      </button>
    </form>
  );
}
