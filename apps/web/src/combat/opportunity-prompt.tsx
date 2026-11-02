import { WEAPON_IDS, type ReactionAttackOption, type WeaponId } from '@ltw/contracts';
import { readableLabel, useT, type Translate } from '@ltw/ui';
import { useId } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { ignoreReaction, opportunityAttack } from './combat-bindings.ts';
import { weaponWords } from './combat-art.ts';
import { useCombatantLabels } from './labels.ts';
import { useAnnounceOnce, type ReactionPromptProps } from './reaction-card.ts';

/** An attack's words: a stat block's own name, a character's weapon, or an Unarmed Strike. */
export function attackWords(t: Translate, option: ReactionAttackOption): string {
  if (option.name !== null) return option.name;
  if ((WEAPON_IDS as readonly string[]).includes(option.attackId)) {
    return weaponWords(t, option.attackId as WeaponId);
  }
  return option.attackId === 'unarmed-strike'
    ? t('Unarmed Strike')
    : readableLabel(option.attackId, t);
}

/**
 * The opportunity attack's question (docs/adr/0046-reactions-beyond-counterspell.md §2), shown to
 * the player whose character — or the creature it commands — a creature is leaving the reach of:
 * who is leaving, an attack button for each melee attack it can make, and "Let it go". The move
 * waits until each answers; the World Engine rolls the attack.
 */
export function OpportunityPrompt({
  encounter,
  canAct,
  locked,
  blocked,
  onRun,
}: ReactionPromptProps) {
  const t = useT();
  const ids = useId();
  const card = useAnnounceOnce(blocked);
  const labelOf = useCombatantLabels(encounter);
  const window = encounter.reactionWindow;
  if (window?.trigger.kind !== 'move') return null;
  const asked = window.candidates.filter((candidate) => (candidate.choices?.length ?? 0) > 0);
  if (asked.length === 0) return null;
  const mover = window.trigger.mover.name ?? labelOf(window.trigger.mover.entityId);
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
      <h3 id={`${ids}-title`}>{t('Reaction: {name}', { name: t('Opportunity Attack') })}</h3>
      <div className="reaction-trigger" id={`${ids}-trigger`}>
        <p>
          <strong>{t('{mover} is leaving your reach', { mover })}</strong>
        </p>
        <p>{t('The move waits until you answer.')}</p>
      </div>
      {asked.map((candidate) => {
        const who = labelOf(candidate.entityId);
        const attacks = candidate.attacks ?? [];
        return (
          <div className="reaction-choices" key={candidate.entityId}>
            {asked.length > 1 && <p className="reaction-who">{who}</p>}
            {attacks.map((option, index) => (
              <button
                key={option.attackId}
                type="button"
                className={index === 0 ? 'primary-button' : undefined}
                aria-label={t('{who}: opportunity attack with {attack}', {
                  who,
                  attack: attackWords(t, option),
                })}
                disabled={!canAct || locked}
                onClick={() => {
                  onRun({
                    kind: 'command',
                    command: opportunityAttack(
                      candidate.entityId,
                      window.windowId,
                      option.attackId,
                    ),
                  });
                }}
              >
                <Glyph name="opportunity-attack" />
                {attackWords(t, option)}
              </button>
            ))}
            <button
              type="button"
              disabled={!canAct || locked}
              onClick={() => {
                onRun({
                  kind: 'command',
                  command: ignoreReaction(candidate.entityId, window.windowId),
                });
              }}
            >
              {t('Let it go')}
            </button>
          </div>
        );
      })}
      <p className="reaction-note">
        {t('An opportunity attack spends your Reaction until your next turn.')}
      </p>
    </section>
  );
}
