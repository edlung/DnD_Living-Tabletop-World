import type { EncounterView, PlayerAssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { Medallion } from '../../visual/medallion.tsx';
import { combatantLabel } from '../board/square-name.ts';
import { HpBar } from '../board/token.tsx';

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
  const current = encounter.combatants.find(
    (entry) => entry.entity.entityId === encounter.currentCombatantId,
  );
  const myTurn = self !== undefined && encounter.currentCombatantId === actorId;
  const window = encounter.reactionWindow;
  const currentName = current ? combatantLabel(current) : encounter.currentCombatantId;
  return (
    <div
      className="encounter-anchor"
      role="status"
      aria-live="off"
      aria-label={t('Encounter anchor')}
    >
      <div className="initiative-band">
        {/* Focusable, so a keyboard can scroll a long order on a narrow screen. */}
        <ol className="initiative" aria-label={t('Turn order')} tabIndex={0}>
          {encounter.order.map((entityId) => {
            const combatant = encounter.combatants.find(
              (entry) => entry.entity.entityId === entityId,
            );
            const acting = entityId === encounter.currentCombatantId;
            if (!combatant) return null;
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
                </span>
                <span className="initiative-name">{combatantLabel(combatant)}</span>
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
            {t('Waiting for {name}; the DM runs creature turns.', { name: currentName })}
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
