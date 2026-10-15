import type { ActionNotice as Notice } from './use-action.ts';
import { useT } from '@ltw/ui';

export function ActionNotice({
  notice,
  status,
  onRetry,
}: {
  readonly notice: Notice | null;
  readonly status: string;
  readonly onRetry: () => void;
}) {
  const t = useT();
  if (!notice) return null;
  const roll = notice.outcome && 'roll' in notice.outcome ? notice.outcome.roll : null;
  return (
    <section
      className="action-notice"
      role={status === 'uncertain' ? 'alert' : 'status'}
      aria-label={t('Action result')}
    >
      <p>{notice.message}</p>
      {roll && (
        <p>
          {t('Check: {d20} + {modifier} = {total}', {
            d20: roll.d20,
            modifier: roll.modifier,
            total: roll.total,
          })}
        </p>
      )}
      {notice.speech && <blockquote>{notice.speech}</blockquote>}
      {status === 'uncertain' && <button onClick={onRetry}>{t('Retry action')}</button>}
    </section>
  );
}
