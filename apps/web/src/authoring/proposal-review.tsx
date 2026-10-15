import type {
  AuthoringIssue,
  AuthoringProposalResponse,
  AuthoringWarning,
  EntityRef,
  ProposableCommand,
  ResolutionOption,
} from '@ltw/contracts';
import { useState } from 'react';

import { describeCommand } from './command-text.ts';
import { ProposalEditor } from './proposal-editor.tsx';
import { useT } from '@ltw/ui';

const CHANGE_TEXT: Readonly<Record<string, string>> = {
  EntityCreated: 'A new person or place is created',
  EntityPlaced: 'They are placed in the world',
  KnowledgeAssigned: 'Someone is given an account to hold',
  DisclosureSet: 'Their willingness to share is set',
  AssetRequested: 'A portrait is requested',
};
const words = (type: string) => type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

const STATUS_TEXT = { DRAFT: 'Draft', COMMITTED: 'Added to the world', UNDONE: 'Undone' } as const;

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
 * One proposal as the DM must judge it: what it would do, how risky it is, what
 * blocks it, what it warns about, and the single confirm. Everything shown is
 * the server's latest preview; a new revision clears every acknowledgement. A
 * committed proposal is undone from the DM history (ADR 0033 §7), which survives
 * a reload; this review is screen-local.
 */
export function ProposalReview({
  data,
  directory,
  busy,
  actions,
}: {
  readonly data: AuthoringProposalResponse;
  readonly directory: readonly EntityRef[];
  readonly busy: boolean;
  readonly actions: {
    readonly revise: (commands: readonly ProposableCommand[]) => void;
    readonly applyOption: (optionId: string) => void;
    readonly commit: (acknowledged: readonly string[]) => void;
    readonly cancel: () => void;
    readonly clear: () => void;
  };
}) {
  const t = useT();
  const { proposal, preview } = data;
  const [accepted, setAccepted] = useState<readonly string[]>([]);
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
  return (
    <section
      className="proposal-review"
      aria-label={t('Authoring proposal')}
      key={`${proposal.proposalId}:${String(proposal.revision)}`}
    >
      <div className="section-heading">
        <h3>{proposal.summary}</h3>
        <span className="status-pill">
          {t(STATUS_TEXT[proposal.status])} ·{' '}
          {t('revision {revision}', { revision: proposal.revision })}
        </span>
      </div>
      <ol className="proposal-commands" aria-label={t('Proposed changes')}>
        {proposal.commands.map((command, index) => (
          <li key={index}>{describeCommand(t, command, directory, names)}</li>
        ))}
      </ol>
      {proposal.status === 'DRAFT' && preview && (
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
                        setAccepted((current) =>
                          event.target.checked
                            ? [...current, warning.key]
                            : current.filter((key) => key !== warning.key),
                        );
                      }}
                    />{' '}
                    {warning.message}
                  </label>
                  <Options options={warning.options} busy={busy} onPick={actions.applyOption} />
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
            <summary>{t('Edit proposal')}</summary>
            <ProposalEditor
              key={proposal.revision}
              commands={proposal.commands}
              locations={locations}
              busy={busy}
              onApply={actions.revise}
            />
          </details>
          <details className="disclosure">
            <summary>{t('What will change in the world')}</summary>
            <ul>
              {preview.changes.map((change, index) => (
                <li key={index}>{t(CHANGE_TEXT[change.type] ?? words(change.type))}</li>
              ))}
            </ul>
          </details>
          <div className="action-row">
            <button
              disabled={busy || !preview.committable || !allAccepted}
              onClick={() => {
                actions.commit(accepted);
              }}
            >
              {t('Confirm and add to the world')}
            </button>
            <button disabled={busy} onClick={actions.cancel}>
              {t('Cancel proposal')}
            </button>
          </div>
        </>
      )}
      {proposal.status === 'COMMITTED' && (
        <p className="muted">{t('To undo it, use the history and undo list below.')}</p>
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
