import type { EncounterView, EntityContextResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { catalogUrl } from '../visual/ui-kit.ts';
import { combatCommandFor, ignoreReaction } from './combat-bindings.ts';
import { useCombatantLabels } from './labels.ts';

/** The open reaction window that asks this viewer's character, if one does. */
export const askedWindowOf = (
  encounter: EncounterView | null,
  actorId: string | null,
): string | null =>
  actorId !== null && encounter?.reactionWindow && encounter.reactionWindow.choices.length > 0
    ? encounter.reactionWindow.windowId
    : null;

/**
 * The reaction question (docs/STAGE_320_DESIGN.md §5.5, ADR 0028 §5), shown only to a
 * character the open window asks: a prominent card — "Reaction: Counterspell", who casts, the
 * components, Counterspell's catalog picture and slot — with Cast and Don't interfere. It is
 * announced once, by taking focus (an alert dialog reads its name and question), once per
 * window; while a modal book covers the stage it waits, and takes focus when the book has
 * closed. The window's lifecycle belongs to the domain: a stale answer is refused there and
 * the prompt simply goes away.
 */
export function ReactionPrompt({
  api,
  encounter,
  actorId,
  canAct,
  locked,
  blocked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string;
  readonly canAct: boolean;
  readonly locked: boolean;
  /** A modal dialog (the Chronicle) is open: everything behind it is inert. */
  readonly blocked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const card = useRef<HTMLElement>(null);
  const window = encounter.reactionWindow;
  const casterId = window?.trigger.caster.entityId ?? '';
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<EntityContextResponse>(`entities/${encodeURIComponent(casterId)}/context`, signal),
    [api, casterId],
  );
  const { resource, retry } = useResource(`${casterId}:${window?.windowId ?? ''}`, load);
  const labelOf = useCombatantLabels(encounter);
  const focused = useRef(false);
  useEffect(() => {
    const element = card.current;
    if (blocked || focused.current || !element) return;
    element.focus({ preventScroll: true });
    focused.current = document.activeElement === element;
  }, [blocked]);
  if (!window || window.choices.length === 0) return null;
  const caster = window.trigger.caster.name ?? labelOf(casterId);
  const counter =
    resource.status === 'ready'
      ? resource.value.context.actions.find((action) => action.id === 'counterspell')
      : undefined;
  const target = encounter.combatants.find((entry) => entry.entity.entityId === casterId);
  const command =
    counter && target
      ? combatCommandFor(
          counter,
          actorId,
          { entityId: casterId, position: target.position },
          encounter,
        )
      : null;
  const offersCounter = window.choices.includes('counterspell');
  const art = catalogUrl('spells', 'counterspell');
  return (
    <section
      ref={card}
      className="reaction-prompt"
      role="alertdialog"
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-trigger`}
      tabIndex={-1}
    >
      <p className="eyebrow reaction-eyebrow">
        <Glyph name="reaction" />
        {t('Reaction available')}
      </p>
      <h3 id={`${ids}-title`}>
        {offersCounter ? t('Reaction: {name}', { name: t('Counterspell') }) : t('Reaction')}
      </h3>
      <div className="reaction-trigger" id={`${ids}-trigger`}>
        <p>
          <strong>{t('{caster} is casting a spell', { caster })}</strong>
        </p>
        <p>
          {t('Components: {components}. The spell waits until you answer.', {
            components: window.trigger.components.map((component) => t(component)).join(', '),
          })}
        </p>
      </div>
      {offersCounter && (
        <div className="reaction-spell">
          {art && <img src={art} alt="" draggable={false} />}
          <div>
            <strong>{t('Counterspell')}</strong>
            {counter?.cost?.kind === 'slot' && (
              <small>{t('Uses a level {level} slot.', { level: counter.cost.slotLevel })}</small>
            )}
            {counter && !counter.legal && (
              <small className="reaction-unavailable">
                {t('Counterspell unavailable: {reason}', {
                  reason: t((counter.reason ?? '').replaceAll('_', ' ').toLowerCase()),
                })}
              </small>
            )}
          </div>
        </div>
      )}
      {resource.status === 'loading' && (
        <StatusPanel state="loading" label={t('Checking Counterspell…')} />
      )}
      {resource.status === 'error' && (
        <StatusPanel state="error" label={resource.message} onRetry={retry} />
      )}
      <div className="reaction-choices">
        {offersCounter && (
          <button
            type="button"
            className="primary-button"
            aria-label={t('Cast Counterspell')}
            disabled={!canAct || locked || command === null}
            onClick={() => {
              if (command) onRun({ kind: 'command', command });
            }}
          >
            <Glyph name="cast" />
            {t('Cast')}
          </button>
        )}
        {window.choices.includes('ignore') && (
          <button
            type="button"
            disabled={!canAct || locked}
            onClick={() => {
              onRun({ kind: 'command', command: ignoreReaction(actorId, window.windowId) });
            }}
          >
            {t('Don’t interfere')}
          </button>
        )}
      </div>
      <p className="reaction-note">
        {t(
          'Counterspell spends a spell slot and may stop the spell. “Don’t interfere” lets the spell happen.',
        )}
      </p>
    </section>
  );
}
