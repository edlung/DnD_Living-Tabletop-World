import type { EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { ProposalReview } from './proposal-review.tsx';
import type { useAuthoring } from './use-authoring.ts';

/**
 * DM only, in the "Add to the world" sheet (docs/STAGE_320_DESIGN.md §5.7). Natural-language
 * intent → structured preview → edit, confirm, or cancel → a native world entity; undo is the
 * History sheet's (ADR 0033 §7). The authoring session is held by the DM's sheets, in memory
 * only, so a change of perspective discards every preview and private fact it showed; the
 * sheet stays mounted while closed, so a draft survives closing it and every refresh.
 */
export function AuthoringPanel({
  authoring,
  directory,
}: {
  readonly authoring: ReturnType<typeof useAuthoring>;
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const [text, setText] = useState('');
  const draft = authoring.proposal?.proposal.status === 'DRAFT';
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
        <button
          type="submit"
          className="primary-button"
          disabled={authoring.busy || draft || text.trim() === ''}
        >
          {authoring.busy && !authoring.proposal ? t('Creating…') : t('Propose')}
        </button>
      </form>
      {authoring.notice && (
        <p
          role={authoring.notice.kind === 'error' ? 'alert' : 'status'}
          className={`authoring-notice ${authoring.notice.kind}`}
        >
          {t(authoring.notice.text)}
        </p>
      )}
      {authoring.proposal && (
        <ProposalReview
          data={authoring.proposal}
          directory={directory}
          busy={authoring.busy}
          actions={authoring}
        />
      )}
    </div>
  );
}
