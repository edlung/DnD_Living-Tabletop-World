import type { CharacterDerived, ResourceView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { UseFeature } from './feature-section.tsx';
import { ACT_WORDS } from './feature-words.ts';

/**
 * Wild Shape's form (docs/adr/0056-characters-from-the-srd.md §5): the Beast forms the Druid's level
 * allows, the lowest Challenge Rating first, and the one it wears with the way back. The World
 * Engine checks the form and applies its numbers.
 */
export function WildShapeForm({
  view,
  shape,
  locked,
  use,
}: {
  readonly view: ResourceView;
  readonly shape: NonNullable<CharacterDerived['wildShape']>;
  readonly locked: boolean;
  readonly use: UseFeature;
}) {
  const t = useT();
  const ids = useId();
  const [formId, setFormId] = useState(shape.current?.formId ?? shape.forms[0]?.formId ?? '');
  return (
    <div className="feature-form wild-shape-form">
      {shape.current && (
        <p className="wild-shape-now">
          {t('In the shape of: {form}', { form: shape.current.name })}
        </p>
      )}
      <div className="feature-field">
        <label htmlFor={`${ids}-form`}>{t('Beast form')}</label>
        <select
          id={`${ids}-form`}
          value={formId}
          onChange={(event) => {
            setFormId(event.target.value);
          }}
        >
          {shape.forms.map((form) => (
            <option key={form.formId} value={form.formId}>
              {t(form.flies ? '{name} (CR {rating}, flies)' : '{name} (CR {rating})', {
                name: form.name,
                rating: form.rating,
              })}
            </option>
          ))}
        </select>
      </div>
      <div className="feature-actions">
        <button
          type="button"
          disabled={locked || view.left === 0 || formId === ''}
          onClick={() => {
            use('wild-shape', { option: formId });
          }}
        >
          {t(ACT_WORDS['wild-shape'])}
        </button>
        {shape.current && (
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              use('end-wild-shape');
            }}
          >
            {t(ACT_WORDS['end-wild-shape'])}
          </button>
        )}
      </div>
    </div>
  );
}
