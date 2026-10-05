import { useT } from './i18n.tsx';

export interface StatusPanelProps {
  readonly state: 'loading' | 'empty' | 'error';
  readonly label: string;
  readonly onRetry?: () => void;
}

export function StatusPanel({ state, label, onRetry }: StatusPanelProps) {
  const t = useT();
  return (
    <div
      className={`status-panel status-panel--${state}`}
      role={state === 'error' ? 'alert' : 'status'}
      aria-busy={state === 'loading'}
    >
      <p>{t(label)}</p>
      {onRetry && state === 'error' ? (
        <button type="button" onClick={onRetry}>
          {t('Try again')}
        </button>
      ) : null}
    </div>
  );
}
