import type { EncounterView, PlayerAssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useRef } from 'react';

import { Medallion } from '../../visual/medallion.tsx';
import { useScrollEdges } from '../../visual/scroll-edges.ts';
import { HpBar } from '../board/token.tsx';
import { splitLabel, useCombatantLabels } from '../labels.ts';

/**
 * The encounter's anchor (ADR 0028 §1, docs/STAGE_320_DESIGN.md §5.5): the turn order as
 * portraits, each with its initiative total and hit points only when the projection carries
 * them and whoever acts highlighted, the round at the right, and beneath it whose turn it is
 * and the viewer's own hit points. It never announces: turn changes are the turn banner's.
 */
export function InitiativeStrip({
  encounter,
  actorId,
  imageOf,
}: {
  readonly encounter: EncounterView;
  readonly actorId: string | null;
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
}) {
  const t = useT();
  const self = encounter.combatants.find((entry) => entry.entity.entityId === actorId);
  const labelOf = useCombatantLabels(encounter);
  const myTurn = self !== undefined && encounter.currentCombatantId === actorId;
  const window = encounter.reactionWindow;
  const currentName = labelOf(encounter.currentCombatantId);
  // A long order scrolls inside the band; its edges fade where more of it hides (Stage 605).
  const list = useRef<HTMLOListElement>(null);
  const edges = useScrollEdges(list, encounter.order.join(' '));
  // A creature the viewer's character commands (ADR 0044 §7): its turn is the viewer's to run.
  const commanded =
    actorId !== null &&
    encounter.combatants.find((c) => c.entity.entityId === encounter.currentCombatantId)
      ?.commandedBy?.entityId === actorId;
  return (
    <div
      className="encounter-anchor"
      role="status"
      aria-live="off"
      aria-label={t('Encounter anchor')}
    >
      <div className="initiative-band">
        {/* Focusable, so a keyboard can scroll a long order on a narrow screen. */}
        <ol
          ref={list}
          className="initiative"
          aria-label={t('Turn order')}
          tabIndex={0}
          data-more-before={edges.before || undefined}
          data-more-after={edges.after || undefined}
        >
          {encounter.order.map((entityId) => {
            const combatant = encounter.combatants.find(
              (entry) => entry.entity.entityId === entityId,
            );
            const acting = entityId === encounter.currentCombatantId;
            if (!combatant) return null;
            // An unnamed combatant's number rides on its portrait; the words wrap beneath.
            const label = labelOf(entityId);
            const { words, number } = splitLabel(label);
            return (
              <li
                key={entityId}
                className={`initiative-entry initiative-entry--${combatant.side}${acting ? ' is-current' : ''}`}
                aria-current={acting ? 'step' : undefined}
              >
                <span className="initiative-portrait">
                  <Medallion
                    image={imageOf(entityId)}
                    kind={combatant.entity.kind}
                    size="sm"
                    tone={combatant.side}
                    condition={
                      combatant.state === 'dead'
                        ? 'dead'
                        : combatant.state === 'down'
                          ? 'unconscious'
                          : null
                    }
                  />
                  {combatant.initiative && (
                    <span className="initiative-total">
                      <span className="visually-hidden">{t('Initiative')} </span>
                      {combatant.initiative.total}
                    </span>
                  )}
                  {number && !combatant.initiative && (
                    <span className="initiative-number" aria-hidden="true">
                      {number}
                    </span>
                  )}
                </span>
                {number ? (
                  <span className="initiative-name">
                    <span className="visually-hidden">{label}</span>
                    <span aria-hidden="true">{words}</span>
                  </span>
                ) : (
                  <span className="initiative-name">{label}</span>
                )}
                {combatant.hitPoints && <HpBar hitPoints={combatant.hitPoints} />}
              </li>
            );
          })}
        </ol>
        <p className="round-mark">{t('Round {round}', { round: encounter.round })}</p>
      </div>
      <p className="anchor-caption">
        <span>{t('Turn: {name}', { name: currentName })}</span>
        {self?.hitPoints && (
          <span>
            {t('You: {current} / {max} HP', {
              current: self.hitPoints.current,
              max: self.hitPoints.max,
            })}
          </span>
        )}
        {self && !myTurn && !window && (
          <span className="muted">
            {commanded
              ? t('{name} is yours to run this turn.', { name: currentName })
              : t('Waiting for {name}; the DM runs creature turns.', { name: currentName })}
          </span>
        )}
        {window && actorId !== null && window.choices.length === 0 && (
          <span className="muted" role="status">
            {t('Waiting for reactions to resolve.')}
          </span>
        )}
      </p>
    </div>
  );
}
