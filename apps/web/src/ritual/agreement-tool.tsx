import {
  AGREEMENT_LIMITS,
  AGREEMENT_LINE_CHARS,
  AGREEMENT_OWN_CHARS,
  AGREEMENT_TONES,
  type AgreementLimit,
  type AgreementRequest,
  type AgreementResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import {
  FAMILY_AGREEMENT,
  limitWords,
  sayUnderstood,
  toneWords,
  useAgreement,
  writeAgreement,
} from './agreement-words.ts';
import { AgreementPage } from './agreement.tsx';
import { PickRadio } from '../book-kit/pick.tsx';

const wordsOf = (answer: AgreementResponse | null): AgreementRequest => {
  const kept = answer?.agreement;
  if (!kept) return FAMILY_AGREEMENT;
  const { tone, toneNote, limits, alsoNot, pauseSign, ages } = kept;
  return { tone, toneNote, limits, alsoNot, pauseSign, ages };
};

/** The page as it is sent: its lines trimmed, its ticks in one order. */
const sent = (words: AgreementRequest): AgreementRequest => ({
  tone: words.tone,
  toneNote: words.toneNote.trim(),
  limits: AGREEMENT_LIMITS.filter((limit) => words.limits.includes(limit)),
  alsoNot: words.alsoNot.trim(),
  pauseSign: words.pauseSign.trim(),
  ages: words.ages.trim(),
});
const same = (a: AgreementRequest, b: AgreementRequest) =>
  JSON.stringify(sent(a)) === JSON.stringify(sent(b));

/**
 * The table's agreement on the DM's Session sheet (docs/adr/0071-memory-and-ritual.md §4): the
 * page as the table reads it, who has said "Understood" (and saying it for someone who did so
 * aloud), showing it on the table's screens, and the form — one screen that starts from what suits
 * a family table.
 */
export function AgreementTool({
  api,
  revision,
}: {
  readonly api: WorldApi;
  readonly revision: number;
}) {
  const t = useT();
  const ids = useId();
  const { answer, reread } = useAgreement(api, revision);
  const [cast, setCast] = useState<'shown' | 'failed' | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [unmarked, setUnmarked] = useState(false);
  if (answer === null) return null;
  const agreement = answer.agreement;
  const readers = answer.readers ?? [];
  const waiting = readers.filter((reader) => !reader.understood);
  return (
    <section className="tool-group agreement-tool" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="ask" />
        {t('The table’s agreement')}
      </h3>
      {agreement === null ? (
        <p className="muted">
          {t(
            'Not written yet. One short page for everyone at the table: the tone, what is not in this game, and how to ask for a pause. It starts from what suits a family table.',
          )}
        </p>
      ) : (
        <>
          <AgreementPage agreement={agreement} />
          {readers.length > 0 && (
            <>
              <h4>
                {t('Understood: {count} of {total}', {
                  count: readers.length - waiting.length,
                  total: readers.length,
                })}
              </h4>
              <ul className="agreement-readers">
                {readers.map((reader) => (
                  <li key={reader.character.entityId}>
                    <span>{reader.character.name}</span>
                    {reader.understood ? (
                      <span className="agreement-yes">{t('understood')}</span>
                    ) : (
                      <button
                        type="button"
                        aria-disabled={marking !== null}
                        aria-label={t('Said it aloud: {name}', { name: reader.character.name })}
                        onClick={() => {
                          if (marking !== null) return;
                          setMarking(reader.character.entityId);
                          setUnmarked(false);
                          void sayUnderstood(
                            api,
                            agreement.version,
                            reader.character.entityId,
                          ).then((said) => {
                            setMarking(null);
                            setUnmarked(!said);
                            reread();
                          });
                        }}
                      >
                        {t('Said it aloud')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {unmarked && (
                <p role="alert" className="authoring-notice error">
                  {t('That was not kept. Try again.')}
                </p>
              )}
            </>
          )}
          <div className="action-row">
            <button
              type="button"
              onClick={() => {
                setCast(null);
                void api
                  .post(
                    'display/cast',
                    { cast: { kind: 'agreement' } },
                    AbortSignal.timeout(20_000),
                  )
                  .then(
                    () => {
                      setCast('shown');
                    },
                    () => {
                      setCast('failed');
                    },
                  );
              }}
            >
              <Glyph name="live" />
              {t('Show the agreement on the table’s screens')}
            </button>
          </div>
          <p role="status" className="muted evening-status">
            {cast === 'shown' ? t('The table’s screens show the agreement. Read it aloud.') : ''}
          </p>
          {cast === 'failed' && (
            <p role="alert" className="authoring-notice error">
              {t('The agreement could not be shown on the table’s screens. Try again.')}
            </p>
          )}
        </>
      )}
      <AgreementForm api={api} answer={answer} onKept={reread} />
    </section>
  );
}

/**
 * The DM writes or changes the page. Open until a page exists; it stays as the DM left it after a
 * save, so what the form says of the save is read where the DM was.
 */
function AgreementForm({
  api,
  answer,
  onKept,
}: {
  readonly api: WorldApi;
  readonly answer: AgreementResponse;
  readonly onKept: () => void;
}) {
  const t = useT();
  const ids = useId();
  const written = answer.agreement !== null;
  const [open, setOpen] = useState(!written);
  const [words, setWords] = useState<AgreementRequest>(() => wordsOf(answer));
  const [state, setState] = useState<'busy' | 'kept' | 'same' | 'failed' | null>(null);
  // Untouched fields follow the kept page (it may change on another of the DM's screens); touched
  // ones are the DM's draft — also what was typed while a save was on its way.
  const touched = useRef(false);
  const latest = useRef(words);
  latest.current = words;
  const version = answer.agreement?.version ?? 0;
  useEffect(() => {
    if (!touched.current) setWords(wordsOf(answer));
    // Only a new version brings new words: the answer itself is a new object at every read.
  }, [version]);
  const change = (patch: Partial<AgreementRequest>) => {
    touched.current = true;
    setWords((before) => ({ ...before, ...patch }));
    if (state !== 'busy') setState(null);
  };
  const tick = (limit: AgreementLimit, on: boolean) => {
    change({
      limits: on ? [...words.limits, limit] : words.limits.filter((kept) => kept !== limit),
    });
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'busy') return;
    // The words as they stand: nobody is told they are asked again when nothing changed.
    if (written && same(words, wordsOf(answer))) {
      touched.current = false;
      setState('same');
      return;
    }
    const going = words;
    setState('busy');
    const kept = await writeAgreement(api, sent(going));
    if (kept && same(latest.current, going)) touched.current = false;
    setState(kept ? 'kept' : 'failed');
    onKept();
  };
  return (
    <details
      className="evening-write"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{written ? t('Change the agreement') : t('Write the agreement')}</summary>
      <form
        className="hand-form agreement-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <fieldset>
          <legend>{t('How we play')}</legend>
          {AGREEMENT_TONES.map((tone) => (
            <PickRadio
              key={tone}
              row
              pick={`tone-${tone}`}
              name={`${ids}-tone`}
              checked={words.tone === tone}
              onChange={() => {
                change({ tone });
              }}
            >
              {toneWords(t, tone)}
            </PickRadio>
          ))}
        </fieldset>
        <label htmlFor={`${ids}-tone-note`}>{t('In your own words (optional)')}</label>
        <input
          id={`${ids}-tone-note`}
          maxLength={AGREEMENT_LINE_CHARS}
          value={words.toneNote}
          onChange={(event) => {
            change({ toneNote: event.target.value });
          }}
        />
        <fieldset>
          <legend>{t('Not in this game')}</legend>
          {AGREEMENT_LIMITS.map((limit) => (
            <label key={limit} className="choice-row">
              <input
                type="checkbox"
                checked={words.limits.includes(limit)}
                onChange={(event) => {
                  tick(limit, event.target.checked);
                }}
              />
              <span>{limitWords(t, limit)}</span>
            </label>
          ))}
        </fieldset>
        <label htmlFor={`${ids}-also`}>{t('Anything else, one per line (optional)')}</label>
        <textarea
          id={`${ids}-also`}
          rows={2}
          maxLength={AGREEMENT_OWN_CHARS}
          value={words.alsoNot}
          onChange={(event) => {
            change({ alsoNot: event.target.value });
          }}
        />
        <label htmlFor={`${ids}-pause`}>{t('Our sign for a pause (optional)')}</label>
        <input
          id={`${ids}-pause`}
          maxLength={AGREEMENT_LINE_CHARS}
          placeholder={t('Raise a hand or say “pause”')}
          value={words.pauseSign}
          onChange={(event) => {
            change({ pauseSign: event.target.value });
          }}
        />
        <label htmlFor={`${ids}-ages`}>{t('Who plays (optional)')}</label>
        <input
          id={`${ids}-ages`}
          maxLength={AGREEMENT_LINE_CHARS}
          placeholder={t('Children from eight, with their parents')}
          value={words.ages}
          onChange={(event) => {
            change({ ages: event.target.value });
          }}
        />
        {written && (
          <p className="muted" id={`${ids}-again`}>
            {t('A change asks everyone to read it again.')}
          </p>
        )}
        <div className="action-row">
          <button
            type="submit"
            className="primary-button"
            aria-disabled={state === 'busy'}
            aria-describedby={written ? `${ids}-again` : undefined}
          >
            {written ? t('Save the changes') : t('Save the agreement')}
          </button>
        </div>
        <p role="status" className="muted evening-status">
          {state === 'kept'
            ? t('Saved. Everyone is asked to read it before the next game.')
            : state === 'same'
              ? t('Nothing was changed.')
              : ''}
        </p>
        {state === 'failed' && (
          <p role="alert" className="authoring-notice error">
            {t('The agreement was not saved. Your words are still here — try again.')}
          </p>
        )}
      </form>
    </details>
  );
}
