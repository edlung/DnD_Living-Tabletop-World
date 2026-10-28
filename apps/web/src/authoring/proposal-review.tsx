import type {
  AuthoringIssue,
  AuthoringProposalResponse,
  AuthoringWarning,
  EntityRef,
  ProposableCommand,
  ResolutionOption,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { describeCommand } from './command-text.ts';
import { editableNpc, ProposalEditor } from './proposal-editor.tsx';
import { whoWillSee } from './who-sees.ts';

const CHANGE_TEXT: Readonly<Record<string, string>> = {
  EntityCreated: 'A new person or place is created',
  EntityPlaced: 'They are placed in the world',
  KnowledgeAssigned: 'Someone is given an account to hold',
  DisclosureSet: 'Their willingness to share is set',
  AssetRequested: 'A portrait is requested',
};
const words = (type: string) => type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

const STATUS_TEXT = {
  DRAFT: 'Draft',
  COMMITTED: 'Added to the world',
  UNDONE: 'Undone',
  CANCELLED: 'Discarded',
} as const;

/**
 * "Tell it in the description" for a witness who was elsewhere (owner decisions 11, SI-D7): the
 * world records only where an NPC is now. A holder this proposal creates is edited here; an NPC
 * already in the world, on its card.
 */
function DescribeThePast({
  warning,
  commands,
  directory,
  onEditHere,
  onShowEntity,
}: {
  readonly warning: AuthoringWarning;
  readonly commands: readonly ProposableCommand[];
  readonly directory: readonly EntityRef[];
  readonly onEditHere: () => void;
  readonly onShowEntity: (entityId: string) => void;
}) {
  const t = useT();
  const [holder] = warning.entityIds;
  if (warning.code !== 'WITNESS_ELSEWHERE' || holder === undefined) return null;
  const created = commands.some(
    (command) => command.type === 'CreateEntity' && command.entityId === holder,
  );
  if (created && editableNpc(commands)) {
    return (
      <button type="button" onClick={onEditHere}>
        {t('Edit the description')}
      </button>
    );
  }
  const known = directory.find((entity) => entity.entityId === holder);
  return known ? (
    <button
      type="button"
      onClick={() => {
        onShowEntity(holder);
      }}
    >
      {t('Edit the description on the card of {name}', { name: known.name })}
    </button>
  ) : null;
}

function Options({
  options,
  busy,
  onPick,
}: {
  readonly options: readonly ResolutionOption[] | undefined;
  readonly busy: boolean;
  readonly onPick: (optionId: string) => void;
}) {
  return (
    <>
      {options
        ?.filter((option) => option.commands !== null)
        .map((option) => (
          <button
            key={option.optionId}
            disabled={busy}
            onClick={() => {
              onPick(option.optionId);
            }}
          >
            {option.label}
          </button>
        ))}
    </>
  );
}

/**
 * One proposal as the DM must judge it (docs/STAGE_320_DESIGN.md §5.7): a card listing what
 * will be added (each with the check glyph), who will see it, how risky it is, what blocks it
 * and what it warns about, then Edit, Confirm and Cancel; afterwards "Added to the world ·
 * revision N". Everything shown is the server's latest preview; a new revision clears every
 * acknowledgement. A committed proposal is undone from the DM history (ADR 0033 §7), which
 * survives a reload; this review is screen-local.
 */
export function ProposalReview({
  data,
  directory,
  busy,
  actions,
  onShowEntity,
}: {
  readonly data: AuthoringProposalResponse;
  readonly directory: readonly EntityRef[];
  readonly busy: boolean;
  /** Opens an NPC's card (its own edit), from a warning about it. */
  readonly onShowEntity: (entityId: string) => void;
  readonly actions: {
    readonly revise: (commands: readonly ProposableCommand[]) => void;
    readonly applyOption: (optionId: string) => void;
    readonly commit: (acknowledged: readonly string[]) => void;
    readonly cancel: () => void;
    readonly clear: () => void;
  };
}) {
  const t = useT();
  const ids = useId();
  const { proposal, preview } = data;
  // Acknowledgements and the open editor belong to one revision: a new one starts with neither.
  const [acknowledged, setAcknowledged] = useState<{
    readonly revision: number;
    readonly keys: readonly string[];
  } | null>(null);
  const accepted = acknowledged?.revision === proposal.revision ? acknowledged.keys : [];
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const editing = editingRevision === proposal.revision;
  // "Edit the description" opens the editor with its description field focused.
  const [describe, setDescribe] = useState(0);
  useEffect(() => {
    if (describe === 0) return;
    document.getElementById('edit-description')?.focus();
  }, [describe]);
  const names = new Map(
    proposal.commands.flatMap((command) =>
      command.type === 'CreateEntity' && command.entityId !== undefined
        ? [[command.entityId, command.name] as const]
        : [],
    ),
  );
  const locations = directory.filter((entity) => entity.kind === 'location');
  const warnings: readonly AuthoringWarning[] = preview?.warnings ?? [];
  const allAccepted = warnings.every((warning) => accepted.includes(warning.key));
  const issues: readonly AuthoringIssue[] = preview?.issues ?? [];
  const draft = proposal.status === 'DRAFT' && preview !== null;
  // A new proposal, revision or outcome comes into view in its sheet (the sheet alone scrolls).
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = card.current;
    const body = element?.closest<HTMLElement>('.sheet-body');
    if (!element || !body) return;
    body.scrollTop += element.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  }, [proposal.proposalId, proposal.revision, proposal.status]);
  return (
    <section
      ref={card}
      className={`proposal-review proposal-review--${proposal.status.toLowerCase()}`}
      aria-label={t('Authoring proposal')}
      key={`${proposal.proposalId}:${String(proposal.revision)}`}
    >
      <header className="proposal-head">
        <Glyph name="add-character" className="proposal-glyph" />
        <div className="proposal-title">
          <p className="eyebrow">{t('Proposal')}</p>
          <h3>{proposal.summary}</h3>
        </div>
        <span className="status-pill">
          {t(STATUS_TEXT[proposal.status])} ·{' '}
          {t('revision {revision}', { revision: proposal.revision })}
        </span>
      </header>
      <div className="proposal-body">
        <section className="proposal-part" aria-labelledby={`${ids}-adds`}>
          <h4 id={`${ids}-adds`}>{t('What will be added')}</h4>
          <ol className="proposal-commands" aria-label={t('Proposed changes')}>
            {proposal.commands.map((command, index) => (
              <li key={index}>
                <Glyph name="confirm" />
                <span>{describeCommand(t, command, directory, names)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="proposal-part proposal-who" aria-labelledby={`${ids}-who`}>
          <h4 id={`${ids}-who`}>
            <Glyph name="who-sees" />
            {t('Who will see')}
          </h4>
          <ul>
            {whoWillSee(t, proposal.commands, directory, names).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
      {draft && (
        <>
          <p className="risk-line">
            {t('Risk:')} <strong>{preview.risk.level}</strong>
            {preview.risk.reasons.length > 0 &&
              ` — ${preview.risk.reasons.map((reason) => reason.reason).join('; ')}`}
          </p>
          {issues.length > 0 && (
            <div role="alert" aria-label={t('Blocking issues')} className="issue-list">
              <strong>{t('This cannot be added until fixed:')}</strong>
              <ul>
                {issues.map((issue) => (
                  <li key={issue.key}>
                    {issue.message}
                    <Options options={issue.options} busy={busy} onPick={actions.applyOption} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <fieldset className="warning-list">
              <legend>{t('Warnings you must accept to continue')}</legend>
              {warnings.map((warning) => (
                <div key={warning.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={accepted.includes(warning.key)}
                      onChange={(event) => {
                        setAcknowledged({
                          revision: proposal.revision,
                          keys: event.target.checked
                            ? [...accepted, warning.key]
                            : accepted.filter((key) => key !== warning.key),
                        });
                      }}
                    />{' '}
                    {warning.message}
                  </label>
                  <Options options={warning.options} busy={busy} onPick={actions.applyOption} />
                  <DescribeThePast
                    warning={warning}
                    commands={proposal.commands}
                    directory={directory}
                    onEditHere={() => {
                      setEditingRevision(proposal.revision);
                      setDescribe((value) => value + 1);
                    }}
                    onShowEntity={onShowEntity}
                  />
                </div>
              ))}
            </fieldset>
          )}
          {preview.notes.map((note) => (
            <p key={`${note.code}:${String(note.commandIndex)}`} className="muted">
              {note.message}
            </p>
          ))}
          <details className="disclosure">
            <summary>{t('What will change in the world')}</summary>
            <ul>
              {preview.changes.map((change, index) => (
                <li key={index}>{t(CHANGE_TEXT[change.type] ?? words(change.type))}</li>
              ))}
            </ul>
          </details>
          <div className="action-row proposal-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy || !preview.committable || !allAccepted}
              onClick={() => {
                actions.commit(accepted);
              }}
            >
              <Glyph name="confirm" />
              {t('Confirm and add to the world')}
            </button>
            <button
              type="button"
              aria-expanded={editing}
              aria-controls={`${ids}-editor`}
              onClick={() => {
                setEditingRevision(editing ? null : proposal.revision);
              }}
            >
              <Glyph name="perform" />
              {t('Edit proposal')}
            </button>
            <button type="button" disabled={busy} onClick={actions.cancel}>
              <Glyph name="cancel" />
              {t('Cancel proposal')}
            </button>
          </div>
          <div id={`${ids}-editor`} className="proposal-editing" hidden={!editing}>
            <ProposalEditor
              key={proposal.revision}
              commands={proposal.commands}
              locations={locations}
              busy={busy}
              onApply={actions.revise}
            />
          </div>
        </>
      )}
      {proposal.status === 'COMMITTED' && (
        <p className="proposal-done">
          <Glyph name="approve" />
          {t('To undo it, use History in the DM tools.')}
        </p>
      )}
      {proposal.status !== 'DRAFT' && (
        <div className="action-row">
          <button disabled={busy} onClick={actions.clear}>
            {t('Start another')}
          </button>
        </div>
      )}
    </section>
  );
}
