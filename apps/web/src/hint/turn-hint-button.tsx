import type {
  CharacterSheetResponse,
  EncounterView,
  EntityContextResponse,
  SurroundingsResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { labelsOf } from '../combat/labels.ts';
import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { fightHint, sceneHint, type HintLine, type HintPage, type HintWay } from './turn-hint.ts';

const WAY_WORDS: Readonly<Record<HintWay, string>> = {
  places: 'Open Places',
  journal: 'Open Journal',
  rules: 'What the rules call these',
  character: 'Open Character',
};

const TONE_WORDS: Readonly<Record<HintLine['tone'], string | null>> = {
  open: 'You can',
  spent: 'Used up',
  info: null,
};

/**
 * "What can I do?" on a player's own screen (docs/adr/0073-table-ideas.md §3): a small button among
 * the table's questions over the stage; pressed, it reads what the server already answers for this
 * hero — what is left of its turn and its own options in a fight, its surroundings outside one —
 * and says it in plain words. Read when opened, and again while it stays open as the table moves.
 */
export function TurnHintButton({
  api,
  actorId,
  encounter,
  onWay,
}: {
  readonly api: WorldApi;
  readonly actorId: string;
  readonly encounter: EncounterView | null;
  /** Takes the reader where a line points; the hint closes first. */
  readonly onWay: (way: HintWay) => void;
}) {
  const t = useT();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="pause-ask-button hint-button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Glyph name="ask" />
        {t('What can I do?')}
      </button>
      <dialog
        ref={dialog}
        className="guide-dialog hint-dialog"
        aria-labelledby={`${ids}-title`}
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
      >
        {open && (
          <HintBody
            api={api}
            actorId={actorId}
            encounter={encounter}
            titleId={`${ids}-title`}
            onClose={() => {
              setOpen(false);
            }}
            onWay={(way) => {
              setOpen(false);
              onWay(way);
            }}
          />
        )}
      </dialog>
    </>
  );
}

function HintBody({
  api,
  actorId,
  encounter,
  titleId,
  onClose,
  onWay,
}: {
  readonly api: WorldApi;
  readonly actorId: string;
  readonly encounter: EncounterView | null;
  readonly titleId: string;
  readonly onClose: () => void;
  readonly onWay: (way: HintWay) => void;
}) {
  const t = useT();
  const fighting = encounter !== null;
  const mine = fighting && encounter.currentCombatantId === actorId;
  // Each read is the hero's own, and failing one only leaves its lines out.
  const loadOwn = useCallback(
    (signal: AbortSignal) =>
      mine
        ? api
            .get<EntityContextResponse>(`entities/${encodeURIComponent(actorId)}/context`, signal)
            .catch(() => null)
        : Promise.resolve(null),
    [api, actorId, mine],
  );
  const loadSheet = useCallback(
    (signal: AbortSignal) =>
      mine
        ? api
            .get<CharacterSheetResponse>(`entities/${encodeURIComponent(actorId)}/sheet`, signal)
            .catch(() => null)
        : Promise.resolve(null),
    [api, actorId, mine],
  );
  const loadAround = useCallback(
    (signal: AbortSignal) =>
      fighting
        ? Promise.resolve(null)
        : api.get<SurroundingsResponse>('surroundings', signal).catch(() => null),
    [api, fighting],
  );
  const own = useResource(`hint-own:${actorId}:${String(mine)}`, loadOwn);
  const sheet = useResource(`hint-sheet:${actorId}:${String(mine)}`, loadSheet);
  const around = useResource(`hint-around:${String(fighting)}`, loadAround);
  const loading =
    own.resource.status === 'loading' ||
    sheet.resource.status === 'loading' ||
    around.resource.status === 'loading';
  let page: HintPage;
  if (fighting) {
    const current = encounter.combatants.find(
      (combatant) => combatant.entity.entityId === encounter.currentCombatantId,
    );
    page = fightHint(t, {
      encounter,
      actorId,
      currentName: current ? labelsOf(encounter, t)(current.entity.entityId) : null,
      own: own.resource.status === 'ready' ? (own.resource.value?.context.actions ?? null) : null,
      sheet: sheet.resource.status === 'ready' ? (sheet.resource.value?.sheet ?? null) : null,
    });
  } else {
    const value = around.resource.status === 'ready' ? around.resource.value : null;
    page = sceneHint(t, {
      place: value?.location?.name ?? null,
      nearby: (value?.nearby ?? []).flatMap((place) => (place.name === null ? [] : [place.name])),
    });
  }
  return (
    <>
      <header className="guide-header">
        <h2 id={titleId}>{page.heading}</h2>
        <IconButton glyph="close" label={t('Close')} onClick={onClose} />
      </header>
      {/* It may scroll on a short screen: the keyboard reaches it. */}
      <section
        className="guide-page hint-page"
        tabIndex={0}
        aria-labelledby={titleId}
        aria-busy={loading}
      >
        <ul className="hint-lines">
          {page.lines.map((line) => {
            const tone = TONE_WORDS[line.tone];
            return (
              <li key={line.id} className="hint-line" data-tone={line.tone}>
                <h3>
                  {line.title}
                  {tone !== null && <span className="hint-tone">{t(tone)}</span>}
                </h3>
                <p>{line.detail}</p>
                {line.examples && line.examples.length > 0 && (
                  <ul className="hint-examples">
                    {line.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                )}
                {line.way && (
                  <button
                    type="button"
                    onClick={() => {
                      const { way } = line;
                      if (way) onWay(way);
                    }}
                  >
                    {t(WAY_WORDS[line.way])}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <footer className="guide-footer">
        <span className="guide-step">
          {t('This list is made from what the game knows of your hero right now.')}
        </span>
        <div className="action-row">
          <button type="button" className="primary-button" onClick={onClose}>
            {t('Got it')}
          </button>
        </div>
      </footer>
    </>
  );
}
