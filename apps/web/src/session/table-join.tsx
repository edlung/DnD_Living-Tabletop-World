import type { EntityRef, TableKey, TableOfferResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useId, useState, type SubmitEvent } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { Field } from './account-forms.tsx';
import type { TableRefusal } from './table-flow.ts';

/**
 * The table's join page (docs/adr/0042-table-display.md §5): the link's free seats — or first its
 * code, typed — then one chosen. The chosen seat's invitation goes to the usual join page, where
 * the person makes a login, signs in, or takes it in this browser only.
 */
type Step =
  | { readonly kind: 'code' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'offer'; readonly offer: TableOfferResponse }
  | { readonly kind: 'refused' | 'limited' | 'unreachable' };

export function TableJoin({
  linked,
  onOffer,
  onChoose,
}: {
  /** The page opened with the link's token (no code to type). */
  readonly linked: boolean;
  readonly onOffer: (key: TableKey | null) => Promise<TableOfferResponse | TableRefusal>;
  readonly onChoose: (
    key: TableKey | null,
    character: EntityRef,
  ) => Promise<'ok' | 'taken' | TableRefusal>;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>(linked ? { kind: 'reading' } : { kind: 'code' });
  const [code, setCode] = useState('');
  const [key, setKey] = useState<TableKey | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (next: TableKey | null) => {
    setStep({ kind: 'reading' });
    const answer = await onOffer(next);
    if (typeof answer === 'string') setStep({ kind: answer });
    else {
      setKey(next);
      setStep({ kind: 'offer', offer: answer });
    }
  };
  useEffect(() => {
    if (linked) void read(null);
    // The link is read once, as the page opens.
  }, []);

  async function typed(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = code.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-HJKMNP-Z2-9]{8}$/.test(clean)) {
      setProblem(t('A table code is eight letters and digits, as the screen shows it.'));
      return;
    }
    setProblem(null);
    await read({ code: clean });
  }

  const choose = async (character: EntityRef) => {
    setBusy(true);
    setProblem(null);
    const answer = await onChoose(key, character);
    setBusy(false);
    if (answer === 'ok') return;
    if (answer === 'taken') {
      setProblem(
        t('Someone took {name} a moment ago. Choose another character.', { name: character.name }),
      );
      await read(key);
      return;
    }
    setStep({ kind: answer });
  };

  if (step.kind === 'reading') {
    return <StatusPanel state="loading" label={t('Reading the table…')} />;
  }
  if (step.kind === 'code') {
    return (
      <form className="account-form" noValidate onSubmit={(event) => void typed(event)}>
        <p>{t('Type the code the table’s screen or the DM shows.')}</p>
        <Field label={t('Table code')} error={problem}>
          {(control) => (
            <input
              {...control}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
            />
          )}
        </Field>
        <div className="action-row">
          <button className="primary-button" type="submit">
            <Glyph name="sign-in" />
            {t('Find the table')}
          </button>
        </div>
      </form>
    );
  }
  if (step.kind !== 'offer') {
    return (
      <div className="account-error" role="alert">
        <p>
          {step.kind === 'limited'
            ? t('Too many tries. Wait a minute, then try again.')
            : step.kind === 'unreachable'
              ? t('The table could not be reached. Check your connection, then try again.')
              : t('This table link is closed or its code is wrong. Ask the DM.')}
        </p>
        <button
          onClick={() => {
            setStep(linked ? { kind: 'reading' } : { kind: 'code' });
            if (linked) void read(null);
          }}
        >
          {t('Try again')}
        </button>
      </div>
    );
  }
  const { offer } = step;
  return (
    <TableOffer
      offer={offer}
      busy={busy}
      problem={problem}
      onChoose={(character) => void choose(character)}
    />
  );
}

function TableOffer({
  offer,
  busy,
  problem,
  onChoose,
}: {
  readonly offer: TableOfferResponse;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onChoose: (character: EntityRef) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <section className="table-offer" aria-labelledby={`${id}-title`}>
      <p className="eyebrow">{offer.campaignName}</p>
      <h3 id={`${id}-title`}>{t('Choose your character')}</h3>
      {problem && (
        <p className="account-error" role="alert">
          {problem}
        </p>
      )}
      {offer.characters.length === 0 ? (
        <p>{t('Every seat at this table is taken. Ask the DM.')}</p>
      ) : (
        <ul className="table-seats">
          {offer.characters.map((character) => (
            <li key={character.entityId}>
              <button
                className="table-seat"
                disabled={busy}
                aria-label={t('Play {name}', { name: character.name })}
                onClick={() => {
                  onChoose(character);
                }}
              >
                <Glyph name="character" />
                {character.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
