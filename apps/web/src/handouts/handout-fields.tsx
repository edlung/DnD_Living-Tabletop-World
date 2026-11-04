import {
  HANDOUT_TEXT_MAX,
  HANDOUT_TITLE_MAX,
  type EntityRef,
  type KeptHandout,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { Field } from '../session/account-forms.tsx';

/**
 * A handout's own fields (docs/adr/0044-online-play.md §5): its title, its text, the picture of
 * something its reader knows — written to give now, to keep for later, or to change a kept one
 * (docs/adr/0058-campaign-content.md §3).
 */
export interface HandoutDraft {
  readonly title: string;
  readonly text: string;
  /** The pictured entity's ID; '' for none. */
  readonly pictured: string;
}

export const EMPTY_DRAFT: HandoutDraft = { title: '', text: '', pictured: '' };

/** The handout a draft holds, or null while it lacks a title, or both a text and a picture. */
export function draftHandout(draft: HandoutDraft): KeptHandout | null {
  const title = draft.title.trim();
  const text = draft.text.trim();
  if (title === '' || (text === '' && draft.pictured === '')) return null;
  return {
    title,
    ...(text === '' ? {} : { text }),
    ...(draft.pictured === '' ? {} : { entityId: draft.pictured }),
  };
}

export function HandoutFields({
  draft,
  onChange,
  attempted,
  directory,
}: {
  readonly draft: HandoutDraft;
  readonly onChange: (draft: HandoutDraft) => void;
  /** A submit was tried: what is missing says so. */
  readonly attempted: boolean;
  /** What the DM may picture: the server keeps it to what the reader knows. */
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const ids = useId();
  const empty = draft.text.trim() === '' && draft.pictured === '';
  return (
    <>
      <Field
        label={t('Title')}
        error={attempted && draft.title.trim() === '' ? t('Give it a title.') : null}
      >
        {(control) => (
          <input
            {...control}
            maxLength={HANDOUT_TITLE_MAX}
            value={draft.title}
            onChange={(event) => {
              onChange({ ...draft, title: event.target.value });
            }}
          />
        )}
      </Field>
      <Field
        label={t('Text (optional)')}
        error={attempted && empty ? t('Write a text or choose a picture.') : null}
      >
        {(control) => (
          <textarea
            {...control}
            rows={3}
            maxLength={HANDOUT_TEXT_MAX}
            value={draft.text}
            onChange={(event) => {
              onChange({ ...draft, text: event.target.value });
            }}
          />
        )}
      </Field>
      <label htmlFor={`${ids}-picture`}>{t('Picture (optional)')}</label>
      <select
        id={`${ids}-picture`}
        value={draft.pictured}
        onChange={(event) => {
          onChange({ ...draft, pictured: event.target.value });
        }}
      >
        <option value="">{t('No picture')}</option>
        {directory.map((entity) => (
          <option key={entity.entityId} value={entity.entityId}>
            {entity.name}
          </option>
        ))}
      </select>
    </>
  );
}
