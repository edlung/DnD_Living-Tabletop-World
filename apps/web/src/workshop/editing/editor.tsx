import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState, type SubmitEvent } from 'react';

import { GROUP_LABELS, SCENARIO_GROUPS, type ScenarioGroup } from '../scenario/graph.ts';
import type { ScenarioSave, ScenarioSaveResult } from '../scenario/edit-fields.tsx';
import { FieldControl } from './field-controls.tsx';
import { changeAt, packageFormSchema, valueAt, type FormPath } from './model.ts';

export interface ManualBuffer {
  readonly baseDigest: string;
  readonly value: unknown;
}

/** Buffer ownership stays with ScenarioTab, across forms and object navigation. */
export function CampaignManualEditor({
  base,
  value,
  onChange,
  onSave,
  onDiscard,
  initialSection = 'world',
  isLocked,
  pending = false,
}: {
  readonly base: CampaignPackage;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly onSave: ScenarioSave;
  readonly onDiscard: () => void;
  readonly initialSection?: ScenarioGroup;
  readonly isLocked?: (path: FormPath) => boolean;
  readonly pending?: boolean;
}) {
  const t = useT();
  const [section, setSection] = useState(initialSection);
  const [state, setState] = useState<'idle' | 'invalid' | 'saving' | ScenarioSaveResult>('idle');
  const [invalid, setInvalid] = useState<string[]>([]);
  const parsed = campaignPackageSchema.safeParse(value);
  const content = parsed.success ? parsed.data : base;
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || state === 'saving') return;
    const checked = campaignPackageSchema.safeParse(value);
    if (!checked.success) {
      setState('invalid');
      setInvalid([...new Set(checked.error.issues.map((issue) => String(issue.path[0] ?? '')))]);
      return;
    }
    setState('saving');
    setState(await onSave(checked.data));
  };
  return (
    <section
      className="workshop-panel campaign-manual-editor"
      tabIndex={-1}
      aria-label={t('Structured campaign editor')}
    >
      <h3>{t('Edit campaign structure')}</h3>
      <p>
        {t(
          'Edit fields, references and lists. Saving creates a new revision; preparation checks identify unresolved dependencies.',
        )}
      </p>
      <label htmlFor="campaign-edit-section">{t('Edit section')}</label>
      <select
        id="campaign-edit-section"
        value={section}
        disabled={state === 'saving'}
        onChange={(event) => {
          setSection(event.target.value as ScenarioGroup);
        }}
      >
        {SCENARIO_GROUPS.map((group) => (
          <option key={group} value={group}>
            {t(GROUP_LABELS[group])}
          </option>
        ))}
      </select>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <FieldControl
          schema={packageFormSchema.properties?.[section] ?? {}}
          value={valueAt(value, [section])}
          field={section}
          path={[section]}
          content={content}
          disabled={pending || state === 'saving'}
          {...(isLocked ? { isLocked } : {})}
          onChange={(next) => {
            onChange(changeAt(value, [section], next));
            setState('idle');
          }}
        />
        <div className="scenario-actions">
          <button type="submit" disabled={pending || state === 'saving'}>
            {state === 'saving' ? t('Saving changes…') : t('Save structural changes')}
          </button>
          <button type="button" disabled={pending || state === 'saving'} onClick={onDiscard}>
            {t('Discard manual changes')}
          </button>
        </div>
      </form>
      <div role="status">
        {state === 'invalid' && (
          <p>
            {t('Some required fields are incomplete. Review these sections: {sections}', {
              sections: invalid
                .map((group) =>
                  t(
                    group in GROUP_LABELS ? GROUP_LABELS[group as ScenarioGroup] : 'Campaign brief',
                  ),
                )
                .join(', '),
            })}
          </p>
        )}
        {state === 'saved' && <p>{t('Corrections saved as a new revision.')}</p>}
        {state === 'conflict' && (
          <p>{t('Another revision or protection changed. Your manual changes are kept.')}</p>
        )}
        {state === 'uncertain' && (
          <p>
            {t(
              'The save could not be confirmed. Retry the original save before changing anything else.',
            )}
          </p>
        )}
      </div>
    </section>
  );
}
