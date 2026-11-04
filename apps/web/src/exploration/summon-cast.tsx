import type { ContextSpell, KernelCommandOf, SummonChoice } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { SummonFields, firstSummon, summonReady } from '../combat/hud/summon-fields.tsx';
import type { ExplorationIntent } from './use-action.ts';

/**
 * A summoning spell cast outside a fight (docs/adr/0056-characters-from-the-srd.md §5): what it
 * calls up and the slot it is cast with are chosen here, and the creature waits beside the
 * caster; a fight that starts puts it right after its caster.
 */
export function SummonCast({
  spell,
  command,
  locked,
  onRun,
  onCancel,
}: {
  readonly spell: ContextSpell & { readonly summon: NonNullable<ContextSpell['summon']> };
  readonly command: KernelCommandOf<'CastSpell'>;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [choice, setChoice] = useState<SummonChoice>(firstSummon(spell.summon));
  const ready = summonReady(spell.summon, choice);
  return (
    <div className="action-choice summon-cast" role="group" aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {t('{spell}: what comes?', { spell: t(spell.name) })}
      </p>
      <SummonFields summon={spell.summon} value={choice} onChange={setChoice} />
      <div className="action-row">
        {/* A higher slot makes a stronger creature: each the caster could spend, lowest first. */}
        {spell.slots.length > 1 ? (
          spell.slots.map((slotLevel, index) => (
            <button
              key={slotLevel}
              type="button"
              className={index === 0 ? 'primary-button' : undefined}
              disabled={locked || !ready}
              onClick={() => {
                onRun({
                  kind: 'command',
                  command: { ...command, using: { slotLevel }, summon: choice },
                });
              }}
            >
              {t('Level {level} slot', { level: slotLevel })}
            </button>
          ))
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={locked || !ready}
            onClick={() => {
              onRun({ kind: 'command', command: { ...command, summon: choice } });
            }}
          >
            {t('Cast {spell}', { spell: t(spell.name) })}
          </button>
        )}
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
