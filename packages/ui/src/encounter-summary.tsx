import type { EncounterResponse, EncounterView, ReactionWindowView } from '@ltw/contracts';

import { readableLabel, readableList } from './labels.ts';
import { StatusPanel } from './status-panel.tsx';

export interface EncounterSummaryProps {
  readonly encounter: EncounterResponse['encounter'];
}

function combatantName(encounter: EncounterView, entityId: string): string {
  return (
    encounter.combatants.find((combatant) => combatant.entity.entityId === entityId)?.entity.name ??
    entityId
  );
}

function ReactionSummary({
  window,
  encounter,
}: {
  readonly window: ReactionWindowView;
  readonly encounter: EncounterView;
}) {
  return (
    <section className="reaction-summary" aria-label="Reaction window">
      <p role="status">Spell resolution is waiting for reactions.</p>
      <dl className="field-list">
        <div>
          <dt>Caster</dt>
          <dd>{window.trigger.caster.name ?? window.trigger.caster.entityId}</dd>
        </div>
        <div>
          <dt>Components</dt>
          <dd>{window.trigger.components.join(', ') || 'None recorded'}</dd>
        </div>
        {window.trigger.spellId ? (
          <div>
            <dt>Spell</dt>
            <dd>{readableLabel(window.trigger.spellId)}</dd>
          </div>
        ) : null}
        {window.trigger.targetId ? (
          <div>
            <dt>Target</dt>
            <dd>{combatantName(encounter, window.trigger.targetId)}</dd>
          </div>
        ) : null}
        {window.trigger.point ? (
          <div>
            <dt>Target point</dt>
            <dd>
              {window.trigger.point.x}, {window.trigger.point.y}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Your available responses</dt>
          <dd>{readableList(window.choices)}</dd>
        </div>
      </dl>
      {window.candidates.length > 0 ? (
        <ul>
          {window.candidates.map((candidate) => (
            <li key={candidate.entityId}>
              {combatantName(encounter, candidate.entityId)}: {readableLabel(candidate.response)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** A scoped status summary, without combat command execution or client-side legality. */
export function EncounterSummary({ encounter }: EncounterSummaryProps) {
  if (!encounter) {
    return (
      <StatusPanel state="empty" label="No active encounter is visible in this perspective." />
    );
  }
  return (
    <section className="encounter-summary" aria-label="Encounter summary">
      <dl className="stat-grid">
        <div>
          <dt>Round</dt>
          <dd>{encounter.round}</dd>
        </div>
        <div>
          <dt>Current turn</dt>
          <dd>{combatantName(encounter, encounter.currentCombatantId)}</dd>
        </div>
      </dl>
      <details className="disclosure">
        <summary>Combatants and turn order</summary>
        <ol className="record-list">
          {encounter.order.map((entityId) => {
            const combatant = encounter.combatants.find(
              (entry) => entry.entity.entityId === entityId,
            );
            if (!combatant)
              return (
                <li key={entityId}>
                  <code>{entityId}</code>
                </li>
              );
            return (
              <li
                key={entityId}
                aria-current={entityId === encounter.currentCombatantId ? 'step' : undefined}
              >
                <h4>{combatant.entity.name ?? entityId}</h4>
                <dl className="field-list">
                  <div>
                    <dt>Side</dt>
                    <dd>{readableLabel(combatant.side)}</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>{readableLabel(combatant.state)}</dd>
                  </div>
                  <div>
                    <dt>Conditions</dt>
                    <dd>{readableList(combatant.conditions)}</dd>
                  </div>
                  <div>
                    <dt>Position</dt>
                    <dd>
                      {combatant.position.x}, {combatant.position.y}
                    </dd>
                  </div>
                  {combatant.hitPoints ? (
                    <div>
                      <dt>Hit points</dt>
                      <dd>
                        {combatant.hitPoints.current} / {combatant.hitPoints.max}
                      </dd>
                    </div>
                  ) : null}
                  {combatant.initiative ? (
                    <div>
                      <dt>Initiative</dt>
                      <dd>
                        {combatant.initiative.total} (roll {combatant.initiative.roll}, modifier{' '}
                        {combatant.initiative.modifier})
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            );
          })}
        </ol>
      </details>
      {encounter.reactionWindow ? (
        <ReactionSummary window={encounter.reactionWindow} encounter={encounter} />
      ) : null}
    </section>
  );
}
