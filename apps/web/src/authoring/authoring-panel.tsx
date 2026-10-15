import type { EntityRef } from '@ltw/contracts';
import { useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { ProposalReview } from './proposal-review.tsx';
import { useAuthoring } from './use-authoring.ts';
import { useT } from '@ltw/ui';

/**
 * DM only. Natural-language intent → structured preview → edit, confirm, or
 * cancel → a native world entity → safe undo. Rendered nowhere else, and held
 * in memory only, so a change of perspective discards every preview and
 * private fact it showed.
 */
export function AuthoringPanel({
  api,
  directory,
  onWorldChanged,
}: {
  readonly api: WorldApi;
  readonly directory: readonly EntityRef[];
  readonly onWorldChanged: () => void;
}) {
  const t = useT();
  const authoring = useAuthoring(api, onWorldChanged);
  const [text, setText] = useState('');
  const draft = authoring.proposal?.proposal.status === 'DRAFT';
  return (
    <details className="disclosure authoring">
      <summary>{t('Add to the world (DM)')}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() !== '') void authoring.propose(text.trim());
        }}
      >
        <label htmlFor="authoring-intent">{t('Describe what to add')}</label>
        <textarea
          id="authoring-intent"
          value={text}
          placeholder={t('Add a young guard near North Gate who saw the caravan leave.')}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <button type="submit" disabled={authoring.busy || draft || text.trim() === ''}>
          {t('Propose')}
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
          blockers={authoring.blockers}
          actions={authoring}
        />
      )}
    </details>
  );
}
