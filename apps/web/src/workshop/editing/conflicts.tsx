import { useT } from '@ltw/ui';
import { campaignRevisionConflictSchema } from '@ltw/contracts';

const WORDS: Readonly<Record<string, string>> = {
  LOCKED_CONTENT:
    'Protected content or a chosen picture would change. Unlock it explicitly or narrow the edit.',
  STALE_LOCKS: 'Protections changed. Review the latest protections before making a new request.',
  STALE_REVISION: 'Another revision was saved. Your input is kept; review the current revision.',
  STALE_MANIFEST: 'Chosen pictures changed. Review them before making a new request.',
  STALE_REVIEW: 'The reviewed result is stale. Refresh the comparison before applying it.',
  REQUEST_REUSED:
    'This request identifier already belongs to another action. Review the current result before starting a new request.',
  INVALID_TARGET: 'The selected target is missing or ambiguous. Review its section before editing.',
  INVALID_CANDIDATE: 'This proposal cannot be applied. Review its scope and preparation checks.',
  IDENTITY_KIND_CHANGED:
    'An existing object cannot change its identity kind. Create a new object instead.',
};
export function EditConflict({ value }: { readonly value: unknown }) {
  const t = useT();
  const parsed = campaignRevisionConflictSchema.safeParse(value);
  return (
    <div className="campaign-conflict" role="status">
      <p>
        {t(
          parsed.success
            ? (WORDS[parsed.data.conflict.reason] ??
                'The draft or its protections changed. Your pending request is kept.')
            : 'The draft or its protections changed. Your pending request is kept.',
        )}
      </p>
      {parsed.success && parsed.data.conflict.conflicts && (
        <ul>
          {parsed.data.conflict.conflicts.map((entry, index) => (
            <li key={index}>{entry.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PendingEditReceipt({
  action,
  onRetry,
  onReset,
}: {
  readonly action: { readonly state: string; readonly conflict: unknown };
  readonly onRetry: () => void;
  readonly onReset: () => void;
}) {
  const t = useT();
  return (
    <>
      {action.state === 'conflict' && <EditConflict value={action.conflict} />}
      {action.state === 'unavailable' && (
        <p role="status">
          {t(
            'AI editing is unavailable for this request. Your instructions and selection are kept.',
          )}
        </p>
      )}
      {action.state === 'uncertain' && (
        <p role="status">
          {t('The answer is uncertain. Retry the original request before making another change.')}
        </p>
      )}
      {action.state === 'uncertain' && (
        <button type="button" onClick={onRetry}>
          {t('Retry original request')}
        </button>
      )}
      {['uncertain', 'conflict'].includes(action.state) && (
        <button type="button" onClick={onReset}>
          {t('Discard pending request and reload current controls')}
        </button>
      )}
    </>
  );
}
