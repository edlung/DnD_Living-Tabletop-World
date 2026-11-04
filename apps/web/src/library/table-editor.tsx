import { DIE_SIDES, RANDOM_TABLE_NAME_MAX, type DieSides } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import { Field } from '../session/account-forms.tsx';
import { dieName, parseTableLines, tablePath, type LinesProblem } from './table-lines.ts';
import type { Library } from './use-library.ts';

/**
 * A random table written or changed (docs/adr/0058-campaign-content.md §4): its name, its die,
 * and its results one a line, each range first; what is wrong is said where it is.
 */
export interface TableDraft {
  /** null: a new table. */
  readonly entryId: string | null;
  readonly name: string;
  readonly die: DieSides;
  readonly lines: string;
}

export function problemWords(t: Translate, problem: LinesProblem, die: DieSides): string {
  switch (problem.kind) {
    case 'empty':
      return t('Write at least one result.');
    case 'too-many':
      return t('More lines than the die has faces.');
    case 'no-range':
      return t('Line {line} has no range: begin it with its number, as 3 or 1–2.', {
        line: problem.line,
      });
    case 'off-die':
      return t('Line {line} goes past the die.', { line: problem.line });
    case 'too-long':
      return t('Line {line} is too long.', { line: problem.line });
    case 'gap':
      return t('The ranges cover 1 to {last} once each, in order: look at {face}.', {
        last: die,
        face: problem.face,
      });
    case 'uneven':
      return t('These lines do not share the die evenly: begin each with its range.');
  }
}

export function TableEditor({
  draft,
  library,
  onDone,
}: {
  readonly draft: TableDraft;
  readonly library: Library;
  readonly onDone: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [name, setName] = useState(draft.name);
  const [die, setDie] = useState<DieSides>(draft.die);
  const [lines, setLines] = useState(draft.lines);
  const [attempted, setAttempted] = useState(false);
  const [said, setSaid] = useState<'full' | 'failed' | null>(null);
  const parsed = parseTableLines(lines, die);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (name.trim() === '' || !parsed.ok) return;
    const entryId = draft.entryId ?? crypto.randomUUID();
    void library
      .write(tablePath(entryId), { name: name.trim(), die, results: parsed.results })
      .then((outcome) => {
        if (outcome === 'done') onDone();
        else setSaid(outcome);
      });
  };
  return (
    <form
      className="hand-form table-editor"
      noValidate
      aria-labelledby={`${ids}-title`}
      onSubmit={submit}
    >
      <h4 id={`${ids}-title`}>
        {draft.entryId === null ? t('A new table') : t('Change: {title}', { title: draft.name })}
      </h4>
      <div className="hand-row">
        <Field
          label={t('Name')}
          error={attempted && name.trim() === '' ? t('Give it a name.') : null}
        >
          {(control) => (
            <input
              {...control}
              maxLength={RANDOM_TABLE_NAME_MAX}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('Die')}>
          {(control) => (
            <select
              {...control}
              value={die}
              onChange={(event) => {
                setDie(Number(event.target.value) as DieSides);
              }}
            >
              {DIE_SIDES.map((sides) => (
                <option key={sides} value={sides}>
                  {dieName(sides)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field
        label={t('Results, one a line')}
        hint={t(
          'Begin each with its range: 1–2 Wolves. Lines with no numbers share the die evenly.',
        )}
        error={attempted && !parsed.ok ? problemWords(t, parsed.problem, die) : null}
      >
        {(control) => (
          <textarea
            {...control}
            rows={8}
            value={lines}
            placeholder={[
              t('1–2 Wolves'),
              t('3 A pedlar with a lame mule'),
              t('4–6 Nothing but rain'),
            ].join('\n')}
            onChange={(event) => {
              setLines(event.target.value);
            }}
          />
        )}
      </Field>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={library.busy}>
          {t('Save the table')}
        </button>
        <button type="button" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
      {said !== null && (
        <p role="alert" className="field-error">
          {said === 'full'
            ? t('Your library holds as many tables as it may: delete one first.')
            : t('The table could not be saved. Try again.')}
        </p>
      )}
    </form>
  );
}
