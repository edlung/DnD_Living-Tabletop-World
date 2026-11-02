import type { EncounterResponse, ReactionWindowView } from '@ltw/contracts';

import { combatantLabels, readableLabel, readableList } from './labels.ts';
import { StatusPanel } from './status-panel.tsx';
import { useT } from './i18n.tsx';

export interface EncounterSummaryProps {
  readonly encounter: EncounterResponse['encounter'];
}

function ReactionSummary({
  window,
  labels,
}: {
  readonly window: ReactionWindowView;
  /** Every combatant's label: its name, or "Unidentified creature N", never an ID. */
  readonly labels: ReadonlyMap<string, string>;
}) {
  const t = useT();
  const nameOf = (entityId: string) => labels.get(entityId) ?? t('Unidentified creature');
  const { trigger } = window;
  return (
    <section className="reaction-summary" aria-label={t('Reaction window')}>
      <p role="status">
        {trigger.kind === 'spell'
          ? t('Spell resolution is waiting for reactions.')
          : t('The move is waiting for opportunity attacks.')}
      </p>
      <dl className="field-list">
        {trigger.kind === 'spell' ? (
          <>
            <div>
              <dt>{t('Caster')}</dt>
              <dd>{trigger.caster.name ?? nameOf(trigger.caster.entityId)}</dd>
            </div>
            <div>
              <dt>{t('Components')}</dt>
              <dd>
                {trigger.components.map((component) => t(component)).join(', ') ||
                  t('None recorded')}
              </dd>
            </div>
            {trigger.spellId ? (
              <div>
                <dt>{t('Spell')}</dt>
                <dd>{readableLabel(trigger.spellId, t)}</dd>
              </div>
            ) : null}
            {trigger.targetId ? (
              <div>
                <dt>{t('Target')}</dt>
                <dd>{nameOf(trigger.targetId)}</dd>
              </div>
            ) : null}
            {trigger.point ? (
              <div>
                <dt>{t('Target point')}</dt>
                <dd>
                  {trigger.point.x}, {trigger.point.y}
                </dd>
              </div>
            ) : null}
          </>
        ) : (
          <div>
            <dt>{t('Moving')}</dt>
            <dd>{trigger.mover.name ?? nameOf(trigger.mover.entityId)}</dd>
          </div>
        )}
        <div>
          <dt>{t('Your available responses')}</dt>
          <dd>{readableList(window.choices, t)}</dd>
        </div>
      </dl>
      {window.candidates.length > 0 ? (
        <ul>
          {window.candidates.map((candidate) => (
            <li key={candidate.entityId}>
              {nameOf(candidate.entityId)}: {readableLabel(candidate.response, t)}
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
  const labels = combatantLabels(encounter, t);
  const nameOf = (entityId: string) => labels.get(entityId) ?? t('Unidentified creature');
  return (
    <section className="encounter-summary" aria-label={t('Encounter summary')}>
      <dl className="stat-grid">
        <div>
          <dt>{t('Round')}</dt>
          <dd>{encounter.round}</dd>
        </div>
        <div>
          <dt>{t('Current turn')}</dt>
          <dd>{nameOf(encounter.currentCombatantId)}</dd>
        </div>
      </dl>
      <details className="disclosure">
        <summary>{t('Combatants and turn order')}</summary>
        <ol className="record-list">
          {encounter.order.map((entityId) => {
            const combatant = encounter.combatants.find(
              (entry) => entry.entity.entityId === entityId,
            );
            if (!combatant) return <li key={entityId}>{nameOf(entityId)}</li>;
            return (
              <li
                key={entityId}
                aria-current={entityId === encounter.currentCombatantId ? 'step' : undefined}
              >
                <h4>{nameOf(entityId)}</h4>
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
        <ReactionSummary window={encounter.reactionWindow} labels={labels} />
      ) : null}
    </section>
  );
}
