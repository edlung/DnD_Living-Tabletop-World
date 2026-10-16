import type { KnowledgeView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useLayoutEffect, useRef } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { KnowledgeCards } from '../visual/knowledge-cards.tsx';
import type { ActionNotice as Notice } from './use-action.ts';

/**
 * Keeps the result's height on the world screen (`--outcome-h`) while it shows, so a phone's
 * scrolling surfaces leave room for it below their content and no control stays under it.
 */
function useReservedHeight(shown: boolean) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    const host = element?.closest<HTMLElement>('.world-main');
    if (!element || !host) return;
    const measure = () => {
      host.style.setProperty('--outcome-h', `${String(element.offsetHeight)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      host.style.removeProperty('--outcome-h');
    };
  }, [shown]);
  return box;
}

/**
 * The result of an action, where it happened (docs/STAGE_320_DESIGN.md §5.2–5.3): the stage
 * anchors it above the medallion it concerns, or at the stage's bottom centre. What was learned
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
  const box = useReservedHeight(notice !== null);
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
