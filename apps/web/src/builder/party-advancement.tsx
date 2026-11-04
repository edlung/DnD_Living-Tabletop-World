import type { EntityRef, LevelsBy } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';

/**
 * The DM's advancement for the party (docs/adr/0056-characters-from-the-srd.md §3), as the campaign
 * counts levels: by experience, an amount divided evenly among the characters ticked; by
 * milestone, a level granted to each of them to take.
 */
export function PartyAdvancement({
  api,
  characters,
  levelsBy,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
  readonly levelsBy: LevelsBy;
}) {
  const t = useT();
  const ids = useId();
  const number = new Intl.NumberFormat(useLanguage());
  const [amount, setAmount] = useState('');
  // Those left out: a character who joins later is ticked.
  const [left, setLeft] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = characters.filter((one) => !left.includes(one.entityId));
  const value = Number(amount);
  const milestone = levelsBy === 'milestone';
  const award = () =>
    api
      .post<{ share: number }>(
        'experience',
        {
          requestId: crypto.randomUUID(),
          amount: value,
          characterIds: chosen.map((one) => one.entityId),
        },
        new AbortController().signal,
        true,
      )
      .then((answer) => {
        setNote(t('{share} XP to each.', { share: number.format(answer.share) }));
        setAmount('');
      })
      .catch(() => {
        setNote(t('The experience could not be awarded.'));
      });
  // One level to take for each, in turn; those it failed for are named.
  const grant = async () => {
    const failed: string[] = [];
    for (const one of chosen) {
      try {
        await api.post(
          `characters/${encodeURIComponent(one.entityId)}/milestone`,
          { requestId: crypto.randomUUID() },
          new AbortController().signal,
          true,
        );
      } catch {
        failed.push(one.name);
      }
    }
    setNote(
      failed.length === 0
        ? t('A level is granted to each to take.')
        : t('The level could not be granted to {names}.', { names: failed.join(', ') }),
    );
  };
  return (
    <section className="sheet-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t(milestone ? 'Milestone' : 'Experience')}</h3>
      <p className="muted">
        {milestone
          ? t('A level for each who reached it, to take with their choices.')
          : t('What the party earned, divided evenly among those who earned it.')}
      </p>
      <form
        className="hand-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void (milestone ? grant() : award()).finally(() => {
            setBusy(false);
          });
        }}
      >
        {!milestone && (
          <Field label={t('Experience points')}>
            {(control) => (
              <input
                {...control}
                inputMode="numeric"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value.replace(/\D/g, '').slice(0, 7));
                }}
              />
            )}
          </Field>
        )}
        <fieldset className="hand-choice">
          <legend>{t(milestone ? 'Who reached it' : 'Who earned it')}</legend>
          {characters.map((one) => (
            <label key={one.entityId}>
              <input
                type="checkbox"
                checked={!left.includes(one.entityId)}
                onChange={(event) => {
                  setLeft((before) =>
                    event.target.checked
                      ? before.filter((id) => id !== one.entityId)
                      : [...before, one.entityId],
                  );
                }}
              />
              {one.name}
            </label>
          ))}
        </fieldset>
        <div className="action-row">
          <button
            type="submit"
            className="primary-button"
            disabled={
              busy || chosen.length === 0 || (!milestone && (!(value > 0) || value > 1_000_000))
            }
          >
            <Glyph name="party" />
            {t(milestone ? 'Grant a level to each' : 'Award, divided evenly')}
          </button>
        </div>
        {note && <p role="status">{note}</p>}
      </form>
    </section>
  );
}
