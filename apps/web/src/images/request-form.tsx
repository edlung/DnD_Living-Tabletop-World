import type { EntityKind } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { useDmImages } from './dm-images.ts';
import type { Context } from './image-cards.tsx';
import { choicesFor, kindOfChoice, requestCommand, STATES, type RequestChoice } from './lineage.ts';
import { CHOICE_WORDS, kindWords, stateWords } from './words.ts';

/** Replace: the form asks for another picture of this kind (a new `nonce` applies it again). */
export interface ReplacePreset {
  readonly choice: RequestChoice;
  readonly state: string | null;
  /** The picture being replaced, in words. */
  readonly what: string;
  readonly nonce: number;
}

/**
 * Requesting a picture (docs/STAGE_330_DESIGN.md "DM controls"; ADR 0035 §4, §6): the main
 * picture, a variant for a state the presentation can choose it by, a figure (a character, NPC
 * or creature) or a battle map (a place) — the last three derive from an approved main picture.
 * The request is built from what the world records about the entity; the DM's note is the one
 * thing the DM adds, and the form says plainly that it reaches the image model. Nothing is
 * requested until the DM presses the button: each request may be a paid generation, so the button
 * waits (`aria-disabled`) from the press until the list shows the request.
 */
export function RequestForm({
  entityId,
  kind,
  canonical,
  context,
  preset,
}: {
  readonly entityId: string;
  readonly kind: EntityKind;
  /** A main picture is approved: variants, figures and battle maps can derive from it. */
  readonly canonical: boolean;
  readonly context: Context;
  readonly preset: ReplacePreset | null;
}) {
  const t = useT();
  const images = useDmImages();
  const ids = useId();
  const states = STATES[kind];
  const [choice, setChoice] = useState<RequestChoice>('reference');
  const [state, setState] = useState(states[0] ?? '');
  const [note, setNote] = useState('');
  const [replacing, setReplacing] = useState<string | null>(null);
  const first = useRef<HTMLSelectElement>(null);
  // The note is a draft: it clears only once the world accepted the request it went with.
  const sent = useRef(false);
  const place = context.place;
  const answer = images?.command;
  useEffect(() => {
    if (!sent.current || answer?.place !== place || answer.status !== 'done') return;
    sent.current = false;
    if (!answer.accepted) return;
    setNote('');
    setReplacing(null);
  }, [answer, place]);
  const nonce = preset?.nonce ?? 0;
  useEffect(() => {
    if (!preset) return;
    setChoice(preset.choice);
    if (preset.state !== null) setState(preset.state);
    setReplacing(preset.what);
    first.current?.scrollIntoView({ block: 'nearest' });
    first.current?.focus({ preventScroll: true });
    // Only a new Replace applies its choice; editing the form afterwards is the DM's own.
  }, [nonce]);
  const derived = choice !== 'reference';
  const blocked = derived && !canonical;
  const waiting = images === null || images.busy;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!images || waiting || blocked) return;
    const asked = kindOfChoice(choice, state);
    const what = kindWords(t, asked);
    images.run({
      place,
      command: requestCommand(entityId, asked, 'players', note),
      subject: t('Request: {subject}', { subject: context.full(what) }),
      target: 'form',
      success: (_now, elsewhere) =>
        elsewhere
          ? t('Requested: {what}. The candidate will appear for your approval.', {
              what: context.full(what),
            })
          : t('Requested: {what}. The candidate will appear here for your approval.', { what }),
    });
    sent.current = true;
  };
  return (
    <form className="image-request" aria-labelledby={`${ids}-title`} onSubmit={submit}>
      <h4 id={`${ids}-title`}>
        <Glyph name="generate" />
        {t('Request a picture')}
      </h4>
      {replacing && (
        <p className="image-request-replacing">
          <Glyph name="replace" />
          {t('Replacing: {what}. The current picture stays until you approve a new one.', {
            what: replacing,
          })}
        </p>
      )}
      <label htmlFor={`${ids}-what`}>{t('What to make')}</label>
      <select
        id={`${ids}-what`}
        ref={first}
        value={choice}
        onChange={(event) => {
          setChoice(event.target.value as RequestChoice);
        }}
      >
        {choicesFor(kind).map((option) => (
          <option key={option} value={option} disabled={option !== 'reference' && !canonical}>
            {t(CHOICE_WORDS[option])}
          </option>
        ))}
      </select>
      <p className="field-hint">
        {canonical
          ? t('Variants, figures and battle maps keep the look of the approved main picture.')
          : t(
              'Variants, figures and battle maps keep the look of the main picture: approve a main picture first.',
            )}
      </p>
      {choice === 'variant' && (
        <>
          <label htmlFor={`${ids}-state`}>{t('For which state')}</label>
          <select
            id={`${ids}-state`}
            value={state}
            onChange={(event) => {
              setState(event.target.value);
            }}
          >
            {states.map((option) => (
              <option key={option} value={option}>
                {stateWords(t, option)}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={`${ids}-note`} className="image-request-note-label">
        <Glyph name="ai-assistant" />
        {t('Note to the image model (optional)')}
      </label>
      <p className="field-hint" id={`${ids}-note-hint`}>
        {t(
          'Sent to the image model with what the world records about it. Players never see it; leave out what the model should not read.',
        )}
      </p>
      <textarea
        id={`${ids}-note`}
        aria-describedby={`${ids}-note-hint`}
        maxLength={300}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <div className="action-row">
        <button
          type="submit"
          className="primary-button"
          disabled={images === null || blocked}
          aria-disabled={waiting || undefined}
        >
          <Glyph name="generate" />
          {t('Request picture')}
        </button>
      </div>
    </form>
  );
}
