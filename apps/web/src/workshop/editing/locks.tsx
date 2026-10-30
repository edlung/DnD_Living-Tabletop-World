import type { DraftLockTarget } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useState, type SubmitEvent } from 'react';

import type { WorkshopClient } from '../client.ts';
import { purposeWords } from '../pictures/words.ts';
import { PendingEditReceipt } from './conflicts.tsx';
import { lockAnswerSchema, type EditingContext } from './schemas.ts';
import { useEditAction } from './use-action.ts';
import { TargetGroups } from './target-groups.tsx';

export const lockTargetKey = (target: DraftLockTarget): string =>
  target.kind === 'content'
    ? `content:${target.targetId}`
    : `image:${target.entityId}:${target.purpose}:${target.variant}:${target.label ?? ''}`;

export function CampaignLocks({
  client,
  draftId,
  context,
  historical,
  onRefresh,
  onPendingChanged,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly context: EditingContext;
  readonly historical: boolean;
  readonly onRefresh: () => void;
  readonly onPendingChanged: (pending: boolean) => void;
}) {
  const t = useT();
  const action = useEditAction(client, onRefresh);
  const [selected, setSelected] = useState<readonly DraftLockTarget[]>(() =>
    context.locks.entries.map((entry) => entry.target),
  );
  const [query, setQuery] = useState('');
  useEffect(() => {
    onPendingChanged(action.blocked);
    return () => {
      onPendingChanged(false);
    };
  }, [action.blocked, onPendingChanged]);
  useEffect(() => {
    if (!action.blocked) setSelected(context.locks.entries.map((entry) => entry.target));
  }, [context.locks.version]);
  const choices: { target: DraftLockTarget; label: string; ambiguous: boolean; group: string }[] =
    context.targets.map((target) => ({
      target: { kind: 'content', targetId: target.targetId },
      label: target.label,
      ambiguous: target.ambiguous,
      group: target.section,
    }));
  for (const entry of context.manifest.entries) {
    const entity = Object.entries(context.revision.identities.entities).find(
      ([, id]) => id === entry.entityId,
    )?.[0];
    const name =
      context.revision.content.entities.find((item) => item.key === entity)?.name ??
      t('An earlier object');
    choices.push({
      target: {
        kind: 'image',
        entityId: entry.entityId,
        purpose: entry.purpose,
        variant: entry.variant,
        label: entry.label,
      },
      label: t('Picture: {name} · {purpose} · {state}', {
        name,
        purpose: purposeWords(t, entry.purpose),
        state: entry.state === 'CURRENT' ? t('Current picture') : t('Chosen picture is stale'),
      }),
      ambiguous: false,
      group: 'pictures',
    });
  }
  for (const entry of context.locks.entries)
    if (!choices.some((choice) => lockTargetKey(choice.target) === lockTargetKey(entry.target)))
      choices.push({
        target: entry.target,
        label: entry.label,
        ambiguous: false,
        group: 'previous',
      });
  const save = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (historical || action.blocked || selected.length > 500) return;
    await action.run(
      `/drafts/${draftId}/locks`,
      {
        requestId: crypto.randomUUID(),
        revision: context.revision.revision,
        packageDigest: context.revision.digest,
        expectedLockVersion: context.locks.version,
        manifestVersion: context.manifest.version,
        manifestDigest: context.manifest.digest,
        targets: selected,
      },
      lockAnswerSchema,
    );
  };
  return (
    <section
      className="workshop-panel campaign-locks"
      aria-label={t('Content and picture protections')}
    >
      <h3>{t('Content and picture protections')}</h3>
      <p>
        {t(
          'A protection keeps the selected content or chosen picture unchanged. Only an explicit unlock removes it.',
        )}
      </p>
      {historical && (
        <p>
          {t(
            'Protections can be changed on the latest revision. Restore this revision first to protect its content.',
          )}
        </p>
      )}
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label htmlFor="campaign-lock-search">{t('Find content or a chosen picture')}</label>
        <input
          id="campaign-lock-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <TargetGroups
          choices={choices.map((choice) => ({
            id: lockTargetKey(choice.target),
            group: choice.group,
            label: choice.label,
            disabled: historical || action.blocked || choice.ambiguous,
            notice: choice.ambiguous
              ? t('Ambiguous object. Repair the whole section first.')
              : null,
          }))}
          selected={new Set(selected.map(lockTargetKey))}
          query={query}
          onToggle={(id, checked) => {
            const choice = choices.find((entry) => lockTargetKey(entry.target) === id);
            if (choice)
              setSelected(
                checked
                  ? [...selected, choice.target]
                  : selected.filter((entry) => lockTargetKey(entry) !== id),
              );
          }}
        />
        {selected.length > 500 && <p role="alert">{t('Choose no more than 500 protections.')}</p>}
        <button type="submit" disabled={historical || action.blocked || selected.length > 500}>
          {action.state === 'busy' ? t('Saving protections…') : t('Save protections')}
        </button>
      </form>
      {action.state === 'done' && <p role="status">{t('Protections saved.')}</p>}
      <PendingEditReceipt
        action={action}
        onRetry={() => {
          void action.retry();
        }}
        onReset={() => {
          action.reset();
          onRefresh();
        }}
      />
    </section>
  );
}
