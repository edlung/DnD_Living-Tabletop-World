import type {
  CampaignBookCheck,
  CastResponse,
  CheckRequestView,
  EntityRef,
  PreparedEncounterView,
  StartedPreparedEncounterResponse,
} from '@ltw/contracts';
import { HANDOUT_TEXT_MAX, HANDOUT_TITLE_MAX, STORY_CAST_CHARS } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { optionWords } from './moments.ts';

/**
 * A moment played from the book (docs/adr/0074-dm-book.md §4): each button here calls what the
 * product already has — the table's check request, the prepared encounter's start, a handout, a
 * cast to the table's screen. The book computes nothing and decides nothing: the answer comes
 * back from the server and is shown as the server gave it.
 */
type Option = CampaignBookCheck['options'][number];
const WHOLE_PARTY = '*';

/** The requests asked from this card, newest first, each with what came of it. */
export function answersTo(
  requests: readonly CheckRequestView[],
  asked: readonly string[],
  option: Option,
  since: string,
): CheckRequestView[] {
  const same = JSON.stringify(option.check);
  return requests
    .filter(
      (request) =>
        asked.includes(request.characterId) &&
        JSON.stringify(request.check) === same &&
        request.status !== 'cancelled' &&
        request.at >= since,
    )
    .sort((a, b) => a.characterId.localeCompare(b.characterId));
}

function AskOption({
  option,
  heroes,
}: {
  readonly option: Option;
  readonly heroes: readonly EntityRef[];
}) {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  const [who, setWho] = useState(option.group && heroes.length > 1 ? WHOLE_PARTY : '');
  const [asked, setAsked] = useState<{
    readonly who: readonly string[];
    readonly since: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const words = optionWords(option);
  const label = t(words.frame, { name: t(words.name), dc: option.dc });
  if (!table) return null;
  const chosen =
    who === WHOLE_PARTY ? heroes.map((hero) => hero.entityId) : who === '' ? [] : [who];
  const ask = async () => {
    const [first, ...rest] = chosen;
    if (first === undefined) return;
    const since = new Date().toISOString();
    const body = { check: option.check, mode: 'normal' as const, dc: option.dc };
    const ok = await table.ask(
      rest.length === 0
        ? { characterId: first, ...body }
        : { characterIds: [first, ...rest], ...body },
    );
    setFailed(!ok);
    if (ok) setAsked({ who: chosen, since });
  };
  const requests = table.requests.status === 'ready' ? table.requests.value.requests : [];
  const answers = asked ? answersTo(requests, asked.who, option, asked.since) : [];
  const nameOf = (id: string) => heroes.find((hero) => hero.entityId === id)?.name ?? id;
  return (
    <li className="dmb-ask">
      <span className="dmb-chip">{label}</span>
      <label className="visually-hidden" htmlFor={`${ids}-who`}>
        {t('Whom to ask: {check}', { check: label })}
      </label>
      <select
        id={`${ids}-who`}
        className="dmb-select"
        value={who}
        onChange={(event) => {
          setWho(event.target.value);
        }}
      >
        <option value="">{t('Whom to ask')}</option>
        {heroes.length > 1 && <option value={WHOLE_PARTY}>{t('The whole party')}</option>}
        {heroes.map((hero) => (
          <option key={hero.entityId} value={hero.entityId}>
            {hero.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="dmb-button dmb-button--main"
        disabled={chosen.length === 0 || table.busy}
        onClick={() => void ask()}
      >
        <Glyph name="roll" />
        {t('Ask for the roll')}
      </button>
      {failed && (
        <p className="dmb-result" role="alert">
          {table.error ?? t('The roll could not be asked. Try again.')}
        </p>
      )}
      {asked && (
        <ul className="dmb-result" aria-live="polite" aria-label={t('Answers to this roll')}>
          {asked.who.map((id) => {
            const answer = answers.find((request) => request.characterId === id);
            return (
              <li key={id}>
                {answer?.status === 'rolled'
                  ? t(
                      answer.success === true
                        ? '{name}: {total} — success'
                        : answer.success === false
                          ? '{name}: {total} — failure'
                          : '{name}: {total}',
                      { name: nameOf(id), total: answer.total ?? 0 },
                    )
                  : t('{name}: asked, waiting for the roll', { name: nameOf(id) })}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** A check's options, each asked of a hero or of the whole party through the table's own request. */
export function AskRoll({
  check,
  heroes,
}: {
  readonly check: CampaignBookCheck;
  readonly heroes: readonly EntityRef[];
}) {
  const t = useT();
  if (check.options.length === 0 || heroes.length === 0) return null;
  return (
    <ul className="dmb-asks" aria-label={t('Ask for the roll')}>
      {check.options.map((option) => (
        <AskOption
          key={`${JSON.stringify(option.check)}-${String(option.dc)}`}
          option={option}
          heroes={heroes}
        />
      ))}
    </ul>
  );
}

const BLOCKED: Readonly<Record<NonNullable<PreparedEncounterView['blocked']>, string>> = {
  'in-combat': 'A fight is already running.',
  'no-foes': 'None of its foes can fight any more.',
  'no-party': 'Nobody of the party is at {place} yet.',
};

/** Starts a prepared encounter as the Encounter section does: one request, never twice. */
export function StartFight({
  api,
  encounter,
  onStarted,
}: {
  readonly api: WorldApi;
  readonly encounter: PreparedEncounterView;
  readonly onStarted: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The request a lost answer is retried under: the server starts nothing twice for it.
  const request = useRef<string | null>(null);
  if (encounter.blocked !== null)
    return (
      <p className="dmb-result">
        {t(BLOCKED[encounter.blocked], { place: encounter.location.name })}
      </p>
    );
  const start = async () => {
    request.current ??= crypto.randomUUID();
    setBusy(true);
    setNote(null);
    try {
      await api.post<StartedPreparedEncounterResponse>(
        `encounters/prepared/${encodeURIComponent(encounter.encounterId)}/start`,
        { requestId: request.current },
        AbortSignal.timeout(30_000),
      );
      request.current = null;
      onStarted();
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) request.current = null;
      setNote(t('The fight did not start. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dmb-act">
      <button
        type="button"
        className="dmb-button dmb-button--main"
        disabled={busy}
        onClick={() => void start()}
      >
        <Glyph name="encounter" />
        {t('Start this fight')}
      </button>
      <p className="dmb-status">
        {t('In the fight: {names}', {
          names: encounter.party.map((hero) => hero.name).join(', '),
        })}
      </p>
      {note !== null && (
        <p className="dmb-result" role="alert">
          {note}
        </p>
      )}
    </div>
  );
}

/** Gives a campaign's handout to the party as any handout is given: the players read it at once. */
export function GiveHandout({ title, text }: { readonly title: string; readonly text: string }) {
  const t = useT();
  const table = useDiceTable();
  const [state, setState] = useState<'idle' | 'busy' | 'given' | 'failed'>('idle');
  if (!table || text === '') return null;
  if (text.length > HANDOUT_TEXT_MAX || title.length > HANDOUT_TITLE_MAX)
    return (
      <p className="dmb-status">
        {t(
          'This handout is longer than a handout the table can be given: read it aloud or show it.',
        )}
      </p>
    );
  return (
    <div className="dmb-act">
      <button
        type="button"
        className="dmb-button dmb-button--main"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          void table.give({ title, text }).then((ok) => {
            setState(ok ? 'given' : 'failed');
          });
        }}
      >
        <Glyph name="give" />
        {state === 'given' ? t('Give it again') : t('Give it to the party')}
      </button>
      <p className="dmb-result" role="status">
        {state === 'given' && t('Given: every player can read it now.')}
        {state === 'failed' && t('It was not given. Try again.')}
      </p>
    </div>
  );
}

/**
 * Shows the spread's picture on the table's screen — alone, or with the chapter's words to read
 * aloud when they fit the story cast. Only on the DM's press: reading never casts.
 */
export function CastToScreen({
  api,
  entityId,
  words,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  /** The words read aloud with this picture, when the spread has them. */
  readonly words: string | null;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'shown' | 'failed'>('idle');
  const cast = async (withWords: boolean) => {
    setState('busy');
    try {
      await api.post<CastResponse>(
        'display/cast',
        {
          cast:
            withWords && words !== null
              ? { kind: 'story', entityId, text: words }
              : { kind: 'picture', entityId },
        },
        AbortSignal.timeout(20_000),
      );
      setState('shown');
    } catch {
      setState('failed');
    }
  };
  const fits = words !== null && words.length > 0 && words.length <= STORY_CAST_CHARS;
  return (
    <div className="dmb-cast">
      <button
        type="button"
        className="dmb-button"
        disabled={state === 'busy'}
        onClick={() => void cast(false)}
      >
        <Glyph name="live" />
        {t('Show on the table’s screen')}
      </button>
      {fits && (
        <button
          type="button"
          className="dmb-button"
          disabled={state === 'busy'}
          onClick={() => void cast(true)}
        >
          {t('With the words read aloud')}
        </button>
      )}
      <span className="dmb-status" role="status">
        {state === 'shown' && t('The table’s screen shows it.')}
        {state === 'failed' && t('The screens could not be told. Try again.')}
      </span>
    </div>
  );
}
