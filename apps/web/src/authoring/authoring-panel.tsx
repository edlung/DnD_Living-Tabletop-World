import type { EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { OpenDrafts } from './open-drafts.tsx';
import { ProposalReview } from './proposal-review.tsx';
import type { useAuthoring } from './use-authoring.ts';

/**
 * DM only, in the "Add to the world" sheet (docs/STAGE_320_DESIGN.md §5.7; concept 04: speak →
 * the world takes shape → review and adjust → part of the world). The intent field with the
 * quill; "Creating…" while the assistant turns the words into a proposal (a ring that turns,
 * still under reduced motion); then the proposal card. Undo is the History sheet's (ADR 0033
 * §7). The screen's copy of the session is held by the DM's world, in memory only, so a change
 * of perspective discards every preview and private fact it showed; the sheet stays mounted
 * while closed, so a draft survives closing it and every refresh, and the draft itself is the
 * server's, so a reload or a return to the DM perspective restores it (owner decisions 11).
 */
export function AuthoringPanel({
  authoring,
  directory,
  onShowEntity,
}: {
  readonly authoring: ReturnType<typeof useAuthoring>;
  readonly directory: readonly EntityRef[];
  /** Opens an NPC's card, where its own edit is (owner decisions 11, SI-D7). */
  readonly onShowEntity: (entityId: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const draft = authoring.proposal?.proposal.status === 'DRAFT';
  const creating = authoring.busy && !authoring.proposal;
  return (
    <div className="authoring">
      <form
        className="authoring-intent"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() !== '') void authoring.propose(text.trim());
        }}
      >
        <label htmlFor="authoring-intent">
          <Glyph name="chronicle" />
          {t('Describe what to add')}
        </label>
        <textarea
          id="authoring-intent"
          value={text}
          placeholder={t('Add a young guard near North Gate who saw the caravan leave.')}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <div className="authoring-intent-row">
          <button
            type="submit"
            className="primary-button"
            disabled={authoring.busy || draft || text.trim() === ''}
          >
            <Glyph name="ai-assistant" />
            {t('Propose')}
          </button>
          {creating && (
            <p role="status" className="authoring-creating">
              <span className="creating-ring" aria-hidden="true" />
              {t('Creating…')}
            </p>
          )}
        </div>
      </form>
      {authoring.notice && (
        <p
          role={authoring.notice.kind === 'error' ? 'alert' : 'status'}
          className={`authoring-notice ${authoring.notice.kind}`}
        >
          {t(authoring.notice.text)}
        </p>
      )}
      <OpenDrafts
        drafts={authoring.drafts}
        shownId={authoring.proposal?.proposal.proposalId ?? null}
        busy={authoring.busy}
        onResume={(id) => void authoring.resume(id)}
        onDiscard={(id) => void authoring.discard(id)}
      />
      {authoring.proposal && (
        <ProposalReview
          data={authoring.proposal}
          directory={directory}
          busy={authoring.busy}
          actions={authoring}
          onShowEntity={onShowEntity}
        />
      )}
    </div>
  );
}
