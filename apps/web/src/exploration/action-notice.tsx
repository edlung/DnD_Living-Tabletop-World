import type { ActionNotice as Notice } from './use-action.ts';

export function ActionNotice({
  notice,
  status,
  onRetry,
}: {
  readonly notice: Notice | null;
  readonly status: string;
  readonly onRetry: () => void;
}) {
  if (!notice) return null;
  const roll = notice.outcome && 'roll' in notice.outcome ? notice.outcome.roll : null;
  return (
    <section
      className="action-notice"
      role={status === 'uncertain' ? 'alert' : 'status'}
      aria-label="Action result"
    >
      <p>{notice.message}</p>
      {roll && (
        <p>
          Check: {roll.d20} + {roll.modifier} = {roll.total}
        </p>
      )}
      {notice.speech && <blockquote>{notice.speech}</blockquote>}
      {status === 'uncertain' && <button onClick={onRetry}>Retry action</button>}
    </section>
  );
}
