import type { KnowledgeView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { useReservedHeight } from '../shell/reserved-height.ts';
import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { KnowledgeCards } from '../visual/knowledge-cards.tsx';
import type { ActionNotice as Notice } from './use-action.ts';

/**
 * The result of an action (docs/STAGE_320_DESIGN.md §5.2–5.3, Gate 06 amendment): one place on
 * the stage, clear of the people and things in the scene (stage.css). What was learned
 * follows beneath it as typed records; spoken words belong to the conversation panel when it
 * shows them (its line is a live region, so they are announced once, there), and are never
 * merged with a record.
 */
export function ActionNotice({
  notice,
  status,
  discovered,
  quoteElsewhere,
  onRetry,
  onDismiss,
}: {
  readonly notice: Notice | null;
  readonly status: string;
  /** Records this result revealed, as the perspective now holds them. */
  readonly discovered: readonly KnowledgeView[];
  /** The conversation panel shows the spoken line. */
  readonly quoteElsewhere: boolean;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}) {
  const t = useT();
  const box = useReservedHeight<HTMLDivElement>('--outcome-h', notice !== null);
  if (!notice) return null;
  const roll = notice.outcome && 'roll' in notice.outcome ? notice.outcome.roll : null;
  const settled = status !== 'busy' && status !== 'uncertain';
  return (
    <div className="outcome" ref={box}>
      <section
        className="action-notice"
        role={status === 'uncertain' ? 'alert' : 'status'}
        aria-label={t('Action result')}
      >
        <p>{notice.message}</p>
        {roll && (
          <p className="notice-roll">
            <Glyph name="roll" />
            {t('Check: {d20} + {modifier} = {total}', {
              d20: roll.d20,
              modifier: roll.modifier,
              total: roll.total,
            })}
          </p>
        )}
        {notice.speech && !quoteElsewhere && <blockquote>{notice.speech}</blockquote>}
        {status === 'uncertain' && <button onClick={onRetry}>{t('Retry action')}</button>}
      </section>
      {discovered.length > 0 && (
        <section className="discovered-knowledge" aria-label={t('New knowledge')}>
          <KnowledgeCards knowledge={discovered} />
        </section>
      )}
      {settled && (
        <IconButton
          glyph="close"
          className="outcome-dismiss"
          label={t('Dismiss the result')}
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
