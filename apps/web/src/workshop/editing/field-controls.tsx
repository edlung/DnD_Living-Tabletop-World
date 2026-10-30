import type { CampaignPackage } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useId } from 'react';

import { SCENARIO_WORDS } from '../scenario/fields.ts';
import { CollectionField } from './collections.tsx';
import { fieldWords } from './words.ts';
import {
  IDENTITY_FIELDS,
  initialValue,
  isRecord,
  matchingBranch,
  referenceOptions,
  schemaBranches,
  variantValue,
  type FormPath,
  type FormSchema,
} from './model.ts';

export interface FieldControlProps {
  readonly schema: FormSchema;
  readonly value: unknown;
  readonly field: string;
  readonly path: FormPath;
  readonly content: CampaignPackage;
  readonly onChange: (value: unknown) => void;
  readonly optional?: boolean;
  readonly disabled?: boolean;
  readonly isLocked?: (path: FormPath) => boolean;
}

export function FieldControl(props: FieldControlProps) {
  const { schema, value, field, optional, onChange } = props;
  const disabled = props.disabled === true || props.isLocked?.(props.path) === true;
  const t = useT();
  const id = useId();
  const label = fieldWords(t, field);
  if (IDENTITY_FIELDS.has(field)) return null;
  if (props.path.join('.') === 'world.language')
    return (
      <p>
        {label}: {typeof value === 'string' ? t(SCENARIO_WORDS[value] ?? value) : ''} ·{' '}
        {t('Draft language is fixed')}
      </p>
    );
  if (optional && value === undefined)
    return (
      <div className="campaign-optional">
        <span>{label}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(initialValue(schema, t('New object'), field));
          }}
        >
          {t('Add {field}', { field: label })}
        </button>
      </div>
    );
  const branches = schemaBranches(schema);
  const nullable = branches.some((entry) => entry.type === 'null');
  const active = matchingBranch(schema, value);
  const activeSchema = branches[active] ?? schema;
  const activeValue = value;
  return (
    <div
      className={`campaign-field campaign-field--${typeof activeSchema.type === 'string' ? activeSchema.type : 'union'}`}
    >
      {optional && (
        <button
          className="campaign-remove-optional"
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(undefined);
          }}
        >
          {t('Remove {field}', { field: label })}
        </button>
      )}
      {branches.length > 1 ? (
        <fieldset disabled={disabled}>
          <legend>{label}</legend>
          <label htmlFor={`${id}-branch`}>{nullable ? t('Value presence') : t('Variant')}</label>
          <select
            id={`${id}-branch`}
            value={active}
            onChange={(event) => {
              const branch = branches[Number(event.target.value)];
              if (branch) onChange(variantValue(branch, t('New object'), field, value));
            }}
          >
            {branches.map((branch, index) => {
              const discriminator = Object.values(branch.properties ?? {}).find(
                (entry) => 'const' in entry,
              )?.const;
              return (
                <option key={index} value={index}>
                  {branch.type === 'null'
                    ? t('None recorded')
                    : nullable
                      ? t('Use a value')
                      : typeof discriminator === 'string'
                        ? SCENARIO_WORDS[discriminator]
                          ? t(SCENARIO_WORDS[discriminator])
                          : readableLabel(discriminator, t)
                        : t('Variant {number}', { number: index + 1 })}
                </option>
              );
            })}
          </select>
          {activeSchema.type !== 'null' && (
            <FieldControl {...props} schema={activeSchema} optional={false} />
          )}
        </fieldset>
      ) : activeSchema.type === 'object' ? (
        <ObjectField {...props} disabled={disabled} label={label} />
      ) : activeSchema.type === 'array' ? (
        <CollectionField {...props} disabled={disabled} />
      ) : (
        <ScalarField {...props} disabled={disabled} id={id} label={label} value={activeValue} />
      )}
    </div>
  );
}

function ObjectField({
  schema,
  value,
  onChange,
  path,
  content,
  disabled,
  label,
  isLocked,
}: FieldControlProps & { readonly label: string }) {
  const data = isRecord(value) ? value : {};
  return (
    <fieldset className="campaign-object" disabled={disabled}>
      <legend>{label}</legend>
      {Object.entries(schema.properties ?? {}).map(([key, entry]) => (
        <FieldControl
          key={key}
          schema={entry}
          field={key}
          path={[...path, key]}
          value={data[key]}
          content={content}
          optional={!schema.required?.includes(key)}
          {...(disabled === undefined ? {} : { disabled })}
          {...(isLocked ? { isLocked } : {})}
          onChange={(next) => {
            onChange(
              next === undefined
                ? Object.fromEntries(Object.entries(data).filter(([name]) => name !== key))
                : { ...data, [key]: next },
            );
          }}
        />
      ))}
    </fieldset>
  );
}

function ScalarField({
  schema,
  value,
  field,
  path,
  content,
  onChange,
  disabled,
  id,
  label,
}: FieldControlProps & { readonly id: string; readonly label: string }) {
  const t = useT();
  const options = schema.type === 'string' ? referenceOptions(content, field, path) : null;
  if ('const' in schema)
    return (
      <p>
        {label}:{' '}
        {SCENARIO_WORDS[String(schema.const)]
          ? t(SCENARIO_WORDS[String(schema.const)] ?? '')
          : readableLabel(String(schema.const), t)}
      </p>
    );
  if (options || schema.enum) {
    const choices =
      options ??
      schema.enum?.map((item) => ({
        value: String(item),
        label: SCENARIO_WORDS[String(item)]
          ? t(SCENARIO_WORDS[String(item)] ?? '')
          : readableLabel(String(item), t),
      })) ??
      [];
    const selected = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    const known = choices.some((entry) => entry.value === selected);
    return (
      <>
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          disabled={disabled}
          value={selected}
          onChange={(event) => {
            onChange(
              schema.type === 'number' || schema.type === 'integer'
                ? Number(event.target.value)
                : event.target.value,
            );
          }}
        >
          {!known && <option value={selected}>{t('Unresolved reference')}</option>}
          {choices.map((entry, index) => (
            <option key={`${entry.value}:${index}`} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </>
    );
  }
  if (schema.type === 'boolean')
    return (
      <label className="campaign-checkbox">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value === true}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        {label}
      </label>
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="number"
          disabled={disabled}
          value={typeof value === 'number' ? value : ''}
          step={schema.type === 'integer' ? 1 : 'any'}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(event) => {
            onChange(event.target.value === '' ? '' : Number(event.target.value));
          }}
        />
      </>
    );
  if (schema.type === 'null') return <p>{t('None recorded')}</p>;
  const text = typeof value === 'string' ? value : '';
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {(schema.maxLength ?? 4000) > 240 ? (
        <textarea
          id={id}
          rows={3}
          disabled={disabled}
          value={text}
          maxLength={schema.maxLength}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <input
          id={id}
          disabled={disabled}
          value={text}
          maxLength={schema.maxLength}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </>
  );
}
