import { useT } from '@ltw/ui';
import { useId } from 'react';

import { fieldWords } from './words.ts';

export interface TargetChoice {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly notice: string | null;
  readonly disabled: boolean;
}
/** Group context disambiguates an entity from its relationship/visual without renaming it. */
export function TargetGroups({
  choices,
  selected,
  query,
  onToggle,
}: {
  readonly choices: readonly TargetChoice[];
  readonly selected: ReadonlySet<string>;
  readonly query: string;
  readonly onToggle: (id: string, checked: boolean) => void;
}) {
  const t = useT();
  const groups = new Map<string, TargetChoice[]>();
  for (const choice of choices) {
    if (!choice.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())) continue;
    const entries = groups.get(choice.group) ?? [];
    entries.push(choice);
    groups.set(choice.group, entries);
  }
  return (
    <div className="campaign-target-list" tabIndex={0}>
      {[...groups].map(([group, entries]) => (
        <fieldset className="campaign-target-group" key={group}>
          <legend>
            {group === 'pictures'
              ? t('Chosen pictures')
              : group === 'previous'
                ? t('Earlier protections')
                : fieldWords(t, group)}
          </legend>
          <ul>
            {entries.map((choice) => (
              <TargetCheckbox
                key={choice.id}
                choice={choice}
                checked={selected.has(choice.id)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </fieldset>
      ))}
      {groups.size === 0 && <p>{t('No matching content')}</p>}
    </div>
  );
}
function TargetCheckbox({
  choice,
  checked,
  onToggle,
}: {
  readonly choice: TargetChoice;
  readonly checked: boolean;
  readonly onToggle: (id: string, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <li>
      <label className="campaign-checkbox">
        <input
          type="checkbox"
          aria-label={choice.label}
          checked={checked}
          disabled={choice.disabled}
          aria-describedby={choice.notice ? id : undefined}
          onChange={(event) => {
            onToggle(choice.id, event.target.checked);
          }}
        />
        <span>
          {choice.label}
          {choice.notice && <small id={id}>{choice.notice}</small>}
        </span>
      </label>
    </li>
  );
}
