import type { EncounterSuggestionResponse, EncounterView, PresenceResponse } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { useAskedFocus } from '../shell/asked-focus.ts';
import { useReservedHeight } from '../shell/reserved-height.ts';
import { Glyph } from '../visual/glyph.tsx';
import { DmReactionWindow } from './dm-reaction-window.tsx';
import { useCombatantLabels } from './labels.ts';
import { standInChoices, type StandIn } from './stand-in.ts';
import { suggestionWords } from './suggestion-words.ts';

/**
 * The DM's turn on the fold-out (docs/adr/0075-book-interface.md §17): the fight is run from the
 * map. Whose turn it is and what the DM does about it lie at the map's foot — a creature's
 * suggested turn (the exact command the server proposes), a hero's turn taken on the player's
 * word with one press, a reaction the table waits for — with "End the fight" and the way to the
 * whole Encounter page beside them. Every action is one the Encounter page already had; a hero's
 * turn taken here is kept in the DM's history as "a turn taken from the map" (ADR 0033 §6), and
 * the reasons a player is stood in for stay on that page.
 */
export function DmTurn({
  api,
  encounter,
  covered,
  locked,
  onRun,
  onActAs,
  onWhole,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  /**
   * Another page lies over the fight: the slip is not drawn under it (the Encounter page shows
   * the same reaction window, and one thing is one control on a screen).
   */
  readonly covered: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onActAs: (standIn: StandIn) => void;
  /** Opens the Encounter page: the turn order's tools, the light, what joins the fight. */
  readonly onWhole: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const labelOf = useCombatantLabels(encounter);
  const [ending, setEnding] = useState(false);
  // The question takes the focus and gives it back: a keyboard keeps its place on the slip.
  const question = useId();
  const asked = useAskedFocus<HTMLButtonElement, HTMLButtonElement>(ending);
  // Wide, the map ends above the slip whatever it holds (`fold-out.css`).
  const slip = useReservedHeight<HTMLElement>('--turn-h', !covered);
  const window = encounter.reactionWindow;
  const loadSuggestion = useCallback(
    (signal: AbortSignal) =>
      api.get<EncounterSuggestionResponse>('encounter/suggestion', signal, false),
    [api],
  );
  const suggested = useResource(
    `turn:${encounter.encounterId}:${String(encounter.round)}:${encounter.currentCombatantId}:${window?.windowId ?? ''}`,
    loadSuggestion,
  );
  const suggestion =
    suggested.resource.status === 'ready' ? suggested.resource.value.suggestion : null;
  const loadPresence = useCallback(
    (signal: AbortSignal) => api.get<PresenceResponse>('presence', signal),
    [api],
  );
  const presence = useResource('turn-presence', loadPresence);
  const connected = (characterId: string) =>
    presence.resource.status === 'ready'
      ? presence.resource.value.characters.find((entry) => entry.character.entityId === characterId)
          ?.present
      : undefined;
  // The heroes the DM may act for now: whose turn it is, and those a reaction waits on.
  const heroes = standInChoices(encounter);
  const act = (characterId: string, name: string) => {
    // Kept in the DM's history as it happened: a turn taken from the map (no claim about why).
    onActAs({
      characterId,
      name,
      reason: 'other',
      note: t('A turn taken from the map'),
      untilDone: true,
    });
  };
  if (covered) return null;
  return (
    <section
      ref={slip}
      className="dm-turn"
      aria-label={t('The DM’s turn slip')}
      data-surface="paper"
    >
      <div className="dm-turn-now">
        <p className="dm-turn-who">
          <Glyph name="encounter" />
          <span>{t("{name}'s turn", { name: labelOf(encounter.currentCombatantId) })}</span>
        </p>
        {window && (
          <DmReactionWindow encounter={encounter} window={window} locked={locked} onRun={onRun} />
        )}
        {!window && suggestion && (
          <p className="dm-turn-suggested">
            <strong>{t('Suggested turn:')}</strong>{' '}
            {language === 'en' ? suggestion.explanation : suggestionWords(t, suggestion, labelOf)}
          </p>
        )}
        {heroes.map((hero) => {
          const present = connected(hero.characterId);
          // Shown for information only: whether a player is away is the DM's call (ADR 0033 §6).
          if (present === undefined) return null;
          return (
            <p key={hero.characterId} className="dm-turn-hero">
              <span className={`stand-in-dot${present ? ' is-present' : ''}`} aria-hidden="true" />
              <span>
                {hero.current ? '' : `${hero.name} · `}
                {present ? t('Player connected') : t('Player not connected')}
              </span>
            </p>
          );
        })}
      </div>
      <div className="dm-turn-actions">
        {!window && suggestion && (
          <button
            type="button"
            className="primary-button"
            disabled={locked}
            onClick={() => {
              onRun({ kind: 'command', command: suggestion.command });
            }}
          >
            {t('Make this move')}
          </button>
        )}
        {heroes.map((hero) => (
          <button
            key={hero.characterId}
            type="button"
            className={hero.current ? 'primary-button' : undefined}
            disabled={locked}
            onClick={() => {
              act(hero.characterId, hero.name);
            }}
          >
            <Glyph name="perform" />
            {/* Whose turn it is stands at the slip's head: the button need not name them again. */}
            {hero.current ? t('Take the hero’s turn') : t('Answer for {name}', { name: hero.name })}
          </button>
        ))}
        <button type="button" onClick={onWhole}>
          {t('The whole Encounter page')}
          <Glyph name="chevron-right" />
        </button>
        {ending ? (
          <span className="dm-turn-ending" role="group" aria-labelledby={question}>
            <span id={question}>{t('End the fight for everyone?')}</span>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                onRun({
                  kind: 'command',
                  command: { type: 'EndCombat', encounterId: encounter.encounterId },
                });
              }}
            >
              {t('Yes, end the fight')}
            </button>
            <button
              ref={asked.careful}
              type="button"
              onClick={() => {
                setEnding(false);
              }}
            >
              {t('Keep fighting')}
            </button>
          </span>
        ) : (
          <button
            ref={asked.ask}
            type="button"
            disabled={locked}
            onClick={() => {
              setEnding(true);
            }}
          >
            <Glyph name="cancel" />
            {t('End the fight')}
          </button>
        )}
      </div>
    </section>
  );
}
