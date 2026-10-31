import type { CampaignEditPlanView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { dependencyWords } from './words.ts';

export function EditClosure({ plan }: { readonly plan: CampaignEditPlanView }) {
  const t = useT();
  return (
    <section className="campaign-edit-closure" aria-label={t('Resolved edit scope')}>
      <h4>{t('Resolved edit scope')}</h4>
      <p>
        {t(
          'Structural references explain this scope. Shared names or possible plot effects are not proof; select additional content explicitly when needed.',
        )}
      </p>
      {plan.conflicts.length > 0 && (
        <ul className="campaign-conflict">
          {plan.conflicts.map((entry, index) => (
            <li key={index}>
              {entry.label} ·{' '}
              {entry.reason === 'LOCKED'
                ? t('Unlock this content explicitly or choose another target.')
                : entry.reason === 'AMBIGUOUS'
                  ? t('Ambiguous object. Repair the whole section first.')
                  : t('This target is no longer present.')}
            </li>
          ))}
        </ul>
      )}
      {plan.spec && (
        <ul>
          {plan.spec.closure.map((item) => (
            <li key={item.targetId}>
              <strong>
                {plan.targets.find((target) => target.targetId === item.targetId)?.label ??
                  t('A related section')}
              </strong>
              <p>
                {item.readOnly
                  ? t('Protected dependency: supplied as read-only context.')
                  : plan.spec?.requestedTargets.includes(item.targetId)
                    ? t('Requested content')
                    : t('Incoming structural dependency')}
              </p>
              <p>
                {item.reasons.length
                  ? item.reasons.map((reason) => dependencyWords(t, reason)).join(' · ')
                  : t('Requested content')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
