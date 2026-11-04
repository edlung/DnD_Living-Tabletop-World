import type { SurprisedSide } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

/** No one, or the side surprised as the fight starts (docs/adr/0045-conditions-and-actions.md §5). */
export type SurpriseValue = SurprisedSide | 'none';

/**
 * Who is surprised as the DM starts a fight: that side rolls Initiative with Disadvantage (SRD
 * 5.2.1). The World Engine rolls it; this only says which side.
 */
export function SurpriseChoice({
  value,
  disabled,
  onChange,
}: {
  readonly value: SurpriseValue;
  readonly disabled: boolean;
  readonly onChange: (value: SurpriseValue) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="surprise-choice">
      <label htmlFor={id}>{t('Surprise')}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-note`}
        onChange={(event) => {
          onChange(event.target.value as SurpriseValue);
        }}
      >
        <option value="none">{t('No one is surprised')}</option>
        <option value="party">{t('The party is surprised')}</option>
        <option value="foes">{t('The foes are surprised')}</option>
      </select>
      <small id={`${id}-note`} className="muted">
        {t('The surprised roll Initiative with Disadvantage.')}
      </small>
    </div>
  );
}
