import type { EntityRef, ProposableCommand } from '@ltw/contracts';
import { useState } from 'react';
import { useT } from '@ltw/ui';

type Create = Extract<ProposableCommand, { type: 'CreateEntity' }>;
type Know = Extract<ProposableCommand, { type: 'AddKnowledge' }>;
type Profile = Extract<ProposableCommand, { type: 'UpdateEntityProfile' }>;

/** A DM's edit of one NPC's card (owner decisions 11, SI-D8): its name and description. */
export function editableProfile(commands: readonly ProposableCommand[]): Profile | null {
  const [only] = commands;
  return commands.length === 1 && only?.type === 'UpdateEntityProfile' ? only : null;
}

function ProfileEditor({
  profile,
  busy,
  onApply,
}: {
  readonly profile: Profile;
  readonly busy: boolean;
  readonly onApply: (commands: readonly ProposableCommand[]) => void;
}) {
  const t = useT();
  const [name, setName] = useState(profile.name ?? '');
  const [description, setDescription] = useState(profile.description ?? '');
  const edited: Profile = {
    type: 'UpdateEntityProfile',
    entityId: profile.entityId,
    ...(name.trim() === '' ? {} : { name: name.trim() }),
    ...(description.trim() === '' ? {} : { description: description.trim() }),
  };
  const valid = edited.name !== undefined || edited.description !== undefined;
  return (
    <form
      className="proposal-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onApply([edited]);
      }}
    >
      <label htmlFor="edit-name">{t('New name (empty keeps it)')}</label>
      <input
        id="edit-name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <label htmlFor="edit-description">{t('New description (empty keeps it)')}</label>
      <textarea
        id="edit-description"
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />
      <button type="submit" disabled={busy || !valid}>
        {t('Apply changes')}
      </button>
    </form>
  );
}

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
  const profile = editableProfile(commands);
  if (!npc && profile) return <ProfileEditor profile={profile} busy={busy} onApply={onApply} />;
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
