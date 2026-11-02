import type { EncounterView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { useReservedHeight } from '../shell/reserved-height.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useCombatantLabels } from './labels.ts';
import { attackWords } from './opportunity-prompt.tsx';

/**
 * The attack the viewer's character readied (docs/adr/0045-conditions-and-actions.md §5), while
 * another creature's turn runs: what it holds, at whom, the moment in the player's own words, and
 * the button that makes it with the Reaction when that moment comes (docs/adr/0046 §5). The rules
 * check the attack; the trigger is the player's call, and the DM sees it.
 */
export function ReadiedCard({
  encounter,
  actorId,
  canAct,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly actorId: string;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  // Its height is kept, as the reaction prompt's: on a phone a result stands above it.
  const card = useReservedHeight<HTMLElement>('--prompt-h', true);
  const labelOf = useCombatantLabels(encounter);
  const readied = encounter.combatants.find((c) => c.entity.entityId === actorId)?.readied;
  if (!readied || encounter.currentCombatantId === actorId || encounter.reactionWindow) {
    return null;
  }
  const target = readied.target.name ?? labelOf(readied.target.entityId);
  const attack = attackWords(t, { attackId: readied.attackId, name: null });
  return (
    <section ref={card} className="reaction-prompt readied-card" aria-labelledby={`${ids}-title`}>
      <p className="eyebrow reaction-eyebrow">
        <Glyph name="ready" />
        {t('Readied')}
      </p>
      <h3 id={`${ids}-title`}>{t('{attack} at {target}', { attack, target })}</h3>
      <p className="reaction-trigger">{t('Trigger: “{trigger}”', { trigger: readied.trigger })}</p>
      <div className="reaction-choices">
        <button
          type="button"
          className="primary-button"
          disabled={!canAct || locked}
          onClick={() => {
            onRun({
              kind: 'command',
              command: { type: 'MakeReadiedAttack', combatantId: actorId },
            });
          }}
        >
          <Glyph name="melee" />
          {t('Make the readied attack')}
        </button>
      </div>
      <p className="reaction-note">
        {t('It spends your Reaction. Unused, it ends with your next turn.')}
      </p>
    </section>
  );
}
