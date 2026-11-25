import type { SurprisedSide } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';
import { PickTiles } from '../book-kit/pick.tsx';

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
      <PickTiles
        legend={t('Surprise')}
        name={id}
        value={value}
        disabled={disabled}
        describedBy={`${id}-note`}
        options={[
          { value: 'none', label: t('No one is surprised'), pick: 'surprise-none' },
          { value: 'party', label: t('The party is surprised'), pick: 'surprise-party' },
          { value: 'foes', label: t('The foes are surprised'), pick: 'surprise-foes' },
        ]}
        onChange={onChange}
      />
      <small id={`${id}-note`} className="muted">
        {t('The surprised roll Initiative with Disadvantage.')}
      </small>
    </div>
  );
}
