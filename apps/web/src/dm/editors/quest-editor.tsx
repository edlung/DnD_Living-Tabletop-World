import { MAX_QUEST_STEPS, type HandQuestView, type QuestListResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import { useResource } from '../../api/resource.ts';
import { Field } from '../../session/account-forms.tsx';
import { freshId } from './editor-words.ts';
import type { EditorProps } from './thing-forms.tsx';

/**
 * Quests by hand (docs/adr/0058-campaign-content.md §2): a new quest written — its title, what it is
 * about, a step a line, whether the party knows it — and each quest by hand kept: its steps ticked,
 * shown to the party or kept, taken away. Each a World Engine command the DM's history undoes.
 */
export function QuestEditor({ api, locked, onRun }: EditorProps) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<QuestListResponse>('quests', signal),
    [api],
  );
  const { resource } = useResource('quests', load);
  const quests = resource.status === 'ready' ? resource.value.handQuests : [];
  return (
    <>
      <NewQuest locked={locked} onRun={onRun} />
      {quests.map((quest) => (
        // A new answer from the server starts the card afresh: its ticks are the server's again.
        <KeptQuest
          key={`${quest.questId}:${quest.steps.map((one) => (one.done ? '1' : '0')).join('')}`}
          quest={quest}
          locked={locked}
          onRun={onRun}
        />
      ))}
    </>
  );
}

function NewQuest({ locked, onRun }: Pick<EditorProps, 'locked' | 'onRun'>) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [lines, setLines] = useState('');
  const [known, setKnown] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const steps = lines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, MAX_QUEST_STEPS);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (title.trim() === '' || steps.length === 0) return;
    onRun({
      type: 'SetQuest',
      questId: freshId('quest'),
      quest: {
        title: title.trim(),
        summary: summary.trim(),
        steps: steps.map((text) => ({ text, done: false })),
        known,
      },
    });
    setTitle('');
    setSummary('');
    setLines('');
    setAttempted(false);
  };
  return (
    <form className="hand-form editor-form" noValidate onSubmit={submit}>
      <Field
        label={t('Title')}
        error={attempted && title.trim() === '' ? t('Give it a title.') : null}
      >
        {(control) => (
          <input
            {...control}
            maxLength={120}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        )}
      </Field>
      <Field label={t('What it is about (optional)')}>
        {(control) => (
          <textarea
            {...control}
            rows={2}
            maxLength={2000}
            value={summary}
            onChange={(event) => {
              setSummary(event.target.value);
            }}
          />
        )}
      </Field>
      <Field
        label={t('Its steps, one a line')}
        hint={t('Up to {count} steps, in the order they are done.', { count: MAX_QUEST_STEPS })}
        error={attempted && steps.length === 0 ? t('Write at least one step.') : null}
      >
        {(control) => (
          <textarea
            {...control}
            rows={4}
            value={lines}
            onChange={(event) => {
              setLines(event.target.value);
            }}
          />
        )}
      </Field>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={known}
          onChange={(event) => {
            setKnown(event.target.checked);
          }}
        />
        {t('The party knows it')}
      </label>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked}>
          {t('Write the quest')}
        </button>
      </div>
    </form>
  );
}

/** A quest by hand kept: its steps ticked, shown or kept, taken away. */
function KeptQuest({
  quest,
  locked,
  onRun,
}: {
  readonly quest: HandQuestView;
  readonly locked: boolean;
  readonly onRun: EditorProps['onRun'];
}) {
  const t = useT();
  const ids = useId();
  const { questId, title, summary, steps, known } = quest;
  // A tick shows at once; the World Engine's answer follows (a refusal brings the server's back).
  const [ticked, setTicked] = useState<readonly boolean[]>(steps.map((one) => one.done));
  return (
    <fieldset className="kept-quest">
      <legend>{title}</legend>
      {steps.map((step, index) => (
        <label key={`${ids}-${String(index)}`} className="checkbox-row">
          <input
            type="checkbox"
            checked={ticked[index] ?? step.done}
            disabled={locked}
            onChange={(event) => {
              const done = event.target.checked;
              setTicked(ticked.map((one, at) => (at === index ? done : one)));
              onRun({ type: 'SetQuestStep', questId, step: index, done });
            }}
          />
          {step.text}
        </label>
      ))}
      <div className="action-row">
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            onRun({
              type: 'SetQuest',
              questId,
              quest: { title, summary, steps: [...steps], known: !known },
            });
          }}
        >
          {known ? t('Keep it from the party') : t('Show it to the party')}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            onRun({ type: 'SetQuest', questId, quest: null });
          }}
        >
          {t('Take it away')}
        </button>
      </div>
    </fieldset>
  );
}
