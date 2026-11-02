import type { EncounterView } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { useCombatantLabels } from './labels.ts';

/**
 * The creature whose turn it is: its actions with a save, for the DM to run
 * (docs/adr/0053-monsters-as-data.md §2). A breath goes toward a chosen creature's square, a
 * single-target action at that creature; one spent until its Recharge comes up, or used up for the
 * day, says so. The World Engine rolls the damage and every save.
 */
export function CreatureActionsCard({
  encounter,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const labelOf = useCombatantLabels(encounter);
  const current = encounter.combatants.find(
    (one) => one.entity.entityId === encounter.currentCombatantId,
  );
  const others = encounter.combatants.filter(
    (one) => one.entity.entityId !== encounter.currentCombatantId && one.state !== 'dead',
  );
  const [targetId, setTargetId] = useState('');
  const actions = current?.creatureActions ?? [];
  if (!current || actions.length === 0 || others.length === 0) return null;
  const target = others.find((one) => one.entity.entityId === targetId) ?? others[0];
  if (!target) return null;
  return (
    <section className="tool-card creature-actions" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>
        <Glyph name="melee" />
        {t('{name}: actions with a save', { name: labelOf(current.entity.entityId) })}
      </h4>
      <Field label={t('Aimed at')}>
        {(control) => (
          <select
            {...control}
            value={target.entity.entityId}
            onChange={(event) => {
              setTargetId(event.target.value);
            }}
          >
            {others.map((one) => (
              <option key={one.entity.entityId} value={one.entity.entityId}>
                {labelOf(one.entity.entityId)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="action-row">
        {actions.map((action) => (
          <button
            key={action.actionId}
            type="button"
            className={action.ready ? 'primary-button' : undefined}
            disabled={locked || !action.ready}
            onClick={() => {
              onRun({
                kind: 'command',
                command: {
                  type: 'UseCreatureAction',
                  combatantId: current.entity.entityId,
                  actionId: action.actionId,
                  ...(action.aim === 'square'
                    ? { point: { x: target.position.x, y: target.position.y } }
                    : { targetId: target.entity.entityId }),
                },
              });
            }}
          >
            {t(action.name)}
          </button>
        ))}
      </div>
      <ul className="creature-action-notes">
        {actions.map((action) => (
          <li key={action.actionId}>
            {action.ready
              ? action.usesLeft !== undefined
                ? t('{name}: {count} left today', { name: t(action.name), count: action.usesLeft })
                : t('{name}: ready', { name: t(action.name) })
              : action.recharge !== undefined
                ? t('{name}: spent, back on a d6 of {recharge} or more', {
                    name: t(action.name),
                    recharge: action.recharge,
                  })
                : t('{name}: used up today', { name: t(action.name) })}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Legendary actions (docs/adr/0053-monsters-as-data.md §4): after another creature's turn, a
 * legendary creature may make the attacks its legendary actions name, so many a round; the DM
 * picks the creature, its target and the attack.
 */
export function LegendaryCard({
  encounter,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const labelOf = useCombatantLabels(encounter);
  const [targetId, setTargetId] = useState('');
  const legendary = encounter.combatants.filter(
    (one) =>
      one.legendary !== undefined &&
      one.state !== 'dead' &&
      one.entity.entityId !== encounter.currentCombatantId,
  );
  if (legendary.length === 0) return null;
  return (
    <section className="tool-card creature-actions" aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>
        <Glyph name="melee" />
        {t('Legendary actions')}
      </h4>
      {legendary.map((creature) => {
        const others = encounter.combatants.filter(
          (one) => one.entity.entityId !== creature.entity.entityId && one.state !== 'dead',
        );
        const target = others.find((one) => one.entity.entityId === targetId) ?? others[0];
        const left = creature.legendary?.usesLeft ?? 0;
        return (
          <div key={creature.entity.entityId} className="legendary-row">
            <p>
              {t('{name}: {count} left this round', {
                name: labelOf(creature.entity.entityId),
                count: left,
              })}
            </p>
            {target && (
              <Field label={t('Aimed at')}>
                {(control) => (
                  <select
                    {...control}
                    value={target.entity.entityId}
                    onChange={(event) => {
                      setTargetId(event.target.value);
                    }}
                  >
                    {others.map((one) => (
                      <option key={one.entity.entityId} value={one.entity.entityId}>
                        {labelOf(one.entity.entityId)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <div className="action-row">
              {creature.legendary?.attacks.map((attack) => (
                <button
                  key={attack.attackId}
                  type="button"
                  disabled={locked || left === 0 || !target}
                  onClick={() => {
                    if (!target) return;
                    onRun({
                      kind: 'command',
                      command: {
                        type: 'Attack',
                        combatantId: creature.entity.entityId,
                        attackId: attack.attackId,
                        targetId: target.entity.entityId,
                        legendary: true,
                      },
                    });
                  }}
                >
                  {t('{attack} (legendary)', { attack: t(attack.name) })}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** The fight's difficulty for the party, the DM's (docs/adr/0053-monsters-as-data.md §3). */
export function DifficultyLine({ encounter }: { readonly encounter: EncounterView }) {
  const t = useT();
  const number = new Intl.NumberFormat(useLanguage());
  const difficulty = encounter.difficulty;
  if (!difficulty) return null;
  const RATING = { low: 'Low', moderate: 'Moderate', high: 'High', beyond: 'Beyond High' } as const;
  return (
    <p className="encounter-difficulty" role="note">
      {t(
        'Difficulty: {rating}. Foes {xp} XP; the party’s budget: Low {low}, Moderate {moderate}, High {high}.',
        {
          rating: t(RATING[difficulty.rating]),
          xp: number.format(difficulty.xp),
          low: number.format(difficulty.budget.low),
          moderate: number.format(difficulty.budget.moderate),
          high: number.format(difficulty.budget.high),
        },
      )}
      {difficulty.unknown > 0 &&
        ` ${t('{count} without XP in their stat block.', { count: difficulty.unknown })}`}
    </p>
  );
}
