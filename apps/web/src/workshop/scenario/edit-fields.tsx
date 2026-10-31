import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useLayoutEffect, useRef, useState, type SubmitEvent } from 'react';

import { FIELD_LABELS } from './fields.ts';
import type { ScenarioNode } from './graph.ts';

export type ScenarioSaveResult = 'saved' | 'conflict' | 'uncertain' | 'failed';
export type ScenarioSave = (content: CampaignPackage) => Promise<ScenarioSaveResult>;
const EDITABLE: Readonly<Record<string, readonly string[]>> = {
  world: ['name', 'worldName', 'opening'],
  brief: ['intent', 'setting', 'tone', 'duration'],
  entities: ['name', 'description'],
  knowledge: ['statement', 'disclosure'],
  clues: ['statement'],
  conflicts: ['title', 'description', 'stakes'],
  situations: ['title', 'description'],
  encounters: ['title', 'trigger'],
  visuals: ['description', 'style'],
};

export function editableValues(node: ScenarioNode): Record<string, string> {
  if (typeof node.value !== 'object' || node.value === null) return {};
  const value = node.value as Record<string, unknown>;
  return Object.fromEntries(
    (EDITABLE[node.group] ?? []).flatMap((key) => {
      if (key === 'disclosure') {
        const scope = value['scope'] as { kind?: string } | undefined;
        if (scope?.kind !== 'NPC') return [];
        return [[key, typeof value[key] === 'string' ? value[key] : '']];
      }
      return typeof value[key] === 'string' ? [[key, value[key]]] : [];
    }),
  );
}

/** Keep keys and reference structure intact; the server validates and recompiles the result. */
export function patchScenarioFields(
  content: CampaignPackage,
  node: ScenarioNode,
  fields: Readonly<Record<string, string>>,
): CampaignPackage | null {
  const allowed = editableValues(node);
  if (Object.keys(fields).some((field) => !(field in allowed))) return null;
  const changes: Record<string, string | undefined> = {};
  for (const [field, value] of Object.entries(fields))
    changes[field] = field === 'disclosure' && value === '' ? undefined : value;
  const value = { ...(node.value as Record<string, unknown>), ...changes };
  const next: unknown =
    node.group === 'world' || node.group === 'brief'
      ? { ...content, [node.group]: value }
      : {
          ...content,
          [node.group]: (content[node.group] as unknown[]).map((item) =>
            item === node.value ? value : item,
          ),
        };
  const parsed = campaignPackageSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

export function EditScenarioFields({
  content,
  node,
  onSave,
}: {
  readonly content: CampaignPackage;
  readonly node: ScenarioNode;
  readonly onSave: ScenarioSave;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(() => editableValues(node));
  const [base, setBase] = useState(content);
  const [submitted, setSubmitted] = useState<CampaignPackage | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'invalid' | ScenarioSaveResult>('idle');
  const form = useRef<HTMLFormElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const focusIntent = useRef<'field' | 'opener' | null>(null);
  useLayoutEffect(() => {
    if (open && focusIntent.current === 'field') {
      form.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    } else if (!open && focusIntent.current === 'opener') {
      opener.current?.focus();
    }
    focusIntent.current = null;
  }, [open]);
  const stale = open && base !== content && state !== 'saved';
  const locked = state === 'saving' || state === 'uncertain' || state === 'conflict' || stale;
  if (Object.keys(fields).length === 0) return null;
  const begin = () => {
    setFields(editableValues(node));
    setBase(content);
    setSubmitted(null);
    setState('idle');
    focusIntent.current = 'field';
    setOpen(true);
  };
  const close = () => {
    focusIntent.current = 'opener';
    setOpen(false);
  };
  const save = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'saving' || state === 'conflict' || stale) return;
    const next = state === 'uncertain' ? submitted : patchScenarioFields(base, node, fields);
    if (!next) {
      setState('invalid');
      return;
    }
    setSubmitted(next);
    setState('saving');
    try {
      const result = await onSave(next);
      setState(result);
      if (result === 'saved') close();
    } catch {
      setState('uncertain');
    }
  };
  return (
    <section className="scenario-edit" aria-label={t('Manual corrections')}>
      {!open ? (
        <button ref={opener} type="button" onClick={begin}>
          {t('Edit fields')}
        </button>
      ) : (
        <form
          ref={form}
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <h4>{t('Manual corrections')}</h4>
          {Object.entries(fields).map(([field, value]) => (
            <label key={field}>
              <span>{t(FIELD_LABELS[field] ?? field)}</span>
              {field === 'disclosure' ? (
                <select
                  value={value}
                  disabled={locked}
                  onChange={(event) => {
                    setFields({ ...fields, [field]: event.target.value });
                  }}
                >
                  <option value="">{t('Guarded (default)')}</option>
                  <option value="WILLING">{t('Willing to share')}</option>
                  <option value="GUARDED">{t('Guarded')}</option>
                </select>
              ) : ['name', 'worldName', 'title'].includes(field) ? (
                <input
                  value={value}
                  maxLength={120}
                  required
                  disabled={locked}
                  onChange={(event) => {
                    setFields({ ...fields, [field]: event.target.value });
                  }}
                />
              ) : (
                <textarea
                  value={value}
                  rows={4}
                  maxLength={field === 'intent' ? 8000 : field === 'statement' ? 2000 : 4000}
                  disabled={locked}
                  onChange={(event) => {
                    setFields({ ...fields, [field]: event.target.value });
                  }}
                />
              )}
            </label>
          ))}
          <div className="scenario-actions">
            <button type="submit" disabled={state === 'saving' || state === 'conflict' || stale}>
              {state === 'saving'
                ? t('Saving changes…')
                : state === 'uncertain'
                  ? t('Retry the same save')
                  : t('Save corrections')}
            </button>
            <button
              type="button"
              disabled={state === 'saving' || state === 'uncertain'}
              onClick={close}
            >
              {t('Close editor')}
            </button>
          </div>
        </form>
      )}
      <div role="status">
        {stale ? (
          <p>{t('The revision changed. Close and reopen the editor before saving.')}</p>
        ) : null}
        {state === 'saved' ? <p>{t('Corrections saved as a new revision.')}</p> : null}
        {state === 'invalid' ? (
          <p>{t('Check the fields. The campaign structure is not valid.')}</p>
        ) : null}
        {state === 'conflict' ? (
          <p>{t('Another revision was saved. Reload the selected revision before editing.')}</p>
        ) : null}
        {state === 'uncertain' ? (
          <p>{t('The save could not be confirmed. Retry the same save to learn its result.')}</p>
        ) : null}
        {state === 'failed' ? <p>{t('The corrections could not be saved. Try again.')}</p> : null}
      </div>
    </section>
  );
}
