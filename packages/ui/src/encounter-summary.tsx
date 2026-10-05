import type { EncounterResponse, EncounterView, ReactionWindowView } from '@ltw/contracts';

import { readableLabel, readableList } from './labels.ts';
import { StatusPanel } from './status-panel.tsx';
import { useT } from './i18n.tsx';

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
  const t = useT();
  return (
    <section className="reaction-summary" aria-label={t('Reaction window')}>
      <p role="status">{t('Spell resolution is waiting for reactions.')}</p>
      <dl className="field-list">
        <div>
          <dt>{t('Caster')}</dt>
          <dd>{window.trigger.caster.name ?? window.trigger.caster.entityId}</dd>
        </div>
        <div>
          <dt>{t('Components')}</dt>
          <dd>
            {window.trigger.components.map((component) => t(component)).join(', ') ||
              t('None recorded')}
          </dd>
        </div>
        {window.trigger.spellId ? (
          <div>
            <dt>{t('Spell')}</dt>
            <dd>{readableLabel(window.trigger.spellId, t)}</dd>
          </div>
        ) : null}
        {window.trigger.targetId ? (
          <div>
            <dt>{t('Target')}</dt>
            <dd>{combatantName(encounter, window.trigger.targetId)}</dd>
          </div>
        ) : null}
        {window.trigger.point ? (
          <div>
            <dt>{t('Target point')}</dt>
            <dd>
              {window.trigger.point.x}, {window.trigger.point.y}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{t('Your available responses')}</dt>
          <dd>{readableList(window.choices, t)}</dd>
        </div>
      </dl>
      {window.candidates.length > 0 ? (
        <ul>
          {window.candidates.map((candidate) => (
            <li key={candidate.entityId}>
              {combatantName(encounter, candidate.entityId)}: {readableLabel(candidate.response, t)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** A scoped status summary, without combat command execution or client-side legality. */
export function EncounterSummary({ encounter }: EncounterSummaryProps) {
  const t = useT();
  if (!encounter) {
    return (
      <StatusPanel state="empty" label={t('No active encounter is visible in this perspective.')} />
    );
  }
  return (
    <section className="encounter-summary" aria-label={t('Encounter summary')}>
      <dl className="stat-grid">
        <div>
          <dt>{t('Round')}</dt>
          <dd>{encounter.round}</dd>
        </div>
        <div>
          <dt>{t('Current turn')}</dt>
          <dd>{combatantName(encounter, encounter.currentCombatantId)}</dd>
        </div>
      </dl>
      <details className="disclosure">
        <summary>{t('Combatants and turn order')}</summary>
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
                    <dt>{t('Side')}</dt>
                    <dd>{readableLabel(combatant.side, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('State')}</dt>
                    <dd>{readableLabel(combatant.state, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('Conditions')}</dt>
                    <dd>{readableList(combatant.conditions, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('Position')}</dt>
                    <dd>
                      {combatant.position.x}, {combatant.position.y}
                    </dd>
                  </div>
                  {combatant.hitPoints ? (
                    <div>
                      <dt>{t('Hit points')}</dt>
                      <dd>
                        {combatant.hitPoints.current} / {combatant.hitPoints.max}
                      </dd>
                    </div>
                  ) : null}
                  {combatant.initiative ? (
                    <div>
                      <dt>{t('Initiative')}</dt>
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
