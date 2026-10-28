import type { OpenProposalSummary } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';

import { formatWhen } from '../dm/players.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * The DM's open drafts, when more than one is open (owner decisions 11, SI-D1 review): the
 * newest is restored on its own, and every other one stays reachable here, to resume or discard,
 * instead of piling up unseen. The list is the server's, newest first.
 */
export function OpenDrafts({
  drafts,
  shownId,
  busy,
  onResume,
  onDiscard,
}: {
  readonly drafts: readonly OpenProposalSummary[];
  /** The draft on screen, if any. */
  readonly shownId: string | null;
  readonly busy: boolean;
  readonly onResume: (proposalId: string) => void;
  readonly onDiscard: (proposalId: string) => void;
}) {
  const t = useT();
  const language = useLanguage();
  if (drafts.length < 2) return null;
  return (
    <section className="open-drafts" aria-labelledby="open-drafts-title">
      <h3 id="open-drafts-title">{t('Open drafts')}</h3>
      <ul>
        {drafts.map((draft) => {
          const shown = draft.proposalId === shownId;
          return (
            <li key={draft.proposalId} className={shown ? 'is-shown' : undefined}>
              <div className="open-draft-text">
                <span className="open-draft-summary">{draft.summary}</span>
                <span className="muted">
                  {formatWhen(draft.updatedAt, language)}
                  {shown ? ` · ${t('shown below')}` : ''}
                </span>
              </div>
              <div className="open-draft-actions">
                {!shown && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={t('Resume: {summary}', { summary: draft.summary })}
                    onClick={() => {
                      onResume(draft.proposalId);
                    }}
                  >
                    <Glyph name="perform" />
                    {t('Resume')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t('Discard: {summary}', { summary: draft.summary })}
                  onClick={() => {
                    onDiscard(draft.proposalId);
                  }}
                >
                  <Glyph name="cancel" />
                  {t('Discard')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
