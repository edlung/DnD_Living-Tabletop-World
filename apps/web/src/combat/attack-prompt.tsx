import type { ReactionChoice } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { ignoreReaction } from './combat-bindings.ts';
import { useCombatantLabels } from './labels.ts';
import { useAnnounceOnce, type ReactionPromptProps } from './reaction-card.ts';

/**
 * An attack's question and a rebuke's (docs/adr/0046-reactions-beyond-counterspell.md §3–4), shown
 * to the player whose character the window asks: a missed attack its Heroic Inspiration may roll
 * again; a hit Shield may turn aside or Uncanny Dodge halve, with what the table hears — the total,
 * the character's own AC, the damage; damage taken, the creature that did it Hellish Rebuke may
 * burn; creatures falling, Feather Fall may slow (docs/adr/0049-space-and-movement.md §8). The
 * World Engine rolls everything; the attack, the damage or the fall waits for the answer.
 */
export function AttackPrompt({ encounter, canAct, locked, blocked, onRun }: ReactionPromptProps) {
  const t = useT();
  const ids = useId();
  const card = useAnnounceOnce(blocked);
  const labelOf = useCombatantLabels(encounter);
  const window = encounter.reactionWindow;
  const trigger = window?.trigger;
  if (
    !window ||
    (trigger?.kind !== 'attack' && trigger?.kind !== 'damage' && trigger?.kind !== 'fall')
  ) {
    return null;
  }
  const asked = window.candidates.find((candidate) => (candidate.choices?.length ?? 0) > 0);
  if (!asked) return null;
  const nameOf = (actor: { readonly entityId: string; readonly name: string | null }) =>
    actor.name ?? labelOf(actor.entityId);
  const use = (reaction: Exclude<ReactionChoice, 'ignore'>) => {
    onRun({
      kind: 'command',
      command: {
        type: 'UseReaction',
        combatantId: asked.entityId,
        windowId: window.windowId,
        reaction,
      },
    });
  };
  const decline = () => {
    onRun({ kind: 'command', command: ignoreReaction(asked.entityId, window.windowId) });
  };
  const choices = asked.choices ?? [];
  let title: string;
  let lines: string[];
  let note: string;
  let keep: string;
  if (trigger.kind === 'damage') {
    title = t('Reaction: {name}', { name: t('Hellish Rebuke') });
    lines = [
      t('{source} damaged you: {amount}.', {
        source: nameOf(trigger.source),
        amount: trigger.amount,
      }),
      t('The damage is done; your answer comes now.'),
    ];
    note = t(
      'Hellish Rebuke spends a level 1 slot or higher: 2d10 Fire, a Dexterity save for half.',
    );
    keep = t('Let it be');
  } else if (trigger.kind === 'fall') {
    title = t('Reaction: {name}', { name: t('Feather Fall') });
    lines = [
      ...trigger.fallers.map(({ creature, feet }) =>
        t('{name} falls {feet} ft.', { name: nameOf(creature), feet }),
      ),
      t('Feather Fall slows up to five of them within 60 ft: they land on their feet, unharmed.'),
    ];
    note = t('Feather Fall spends your Reaction and a level 1 slot or higher.');
    keep = t('Let them fall');
  } else if (trigger.phase === 'missed') {
    title = t('Heroic Inspiration');
    lines = [
      t('Your attack missed (total {total}).', { total: trigger.total }),
      t('Spend Heroic Inspiration to roll the d20 again? You must take the new roll.'),
    ];
    note = t('Heroic Inspiration is spent whatever the new roll.');
    keep = t('Keep the roll');
  } else {
    title = t('Reaction: you are hit');
    lines = [
      trigger.critical
        ? t('{attacker} hits you with a critical hit (total {total}, your AC {ac}).', {
            attacker: nameOf(trigger.attacker),
            total: trigger.total,
            ac: trigger.armorClass ?? '–',
          })
        : t('{attacker} hits you (total {total}, your AC {ac}).', {
            attacker: nameOf(trigger.attacker),
            total: trigger.total,
            ac: trigger.armorClass ?? '–',
          }),
      t('It would deal {damage} damage.', { damage: trigger.damage ?? 0 }),
    ];
    note = t('A reaction is spent until your next turn.');
    keep = t('Take the hit');
  }
  const damage = trigger.kind === 'attack' ? (trigger.damage ?? 0) : 0;
  const button: Readonly<Partial<Record<Exclude<ReactionChoice, 'ignore'>, string>>> = {
    'inspiration-reroll': t('Roll again'),
    shield: t('Shield: +5 AC, it misses'),
    'uncanny-dodge': t('Uncanny Dodge: take {damage}', { damage: Math.floor(damage / 2) }),
    'hellish-rebuke': t('Hellish Rebuke'),
    'feather-fall': t('Feather Fall'),
  };
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
      <h3 id={`${ids}-title`}>{title}</h3>
      <div className="reaction-trigger" id={`${ids}-trigger`}>
        {lines.map((line, index) => (
          <p key={line}>{index === 0 ? <strong>{line}</strong> : line}</p>
        ))}
      </div>
      <div className="reaction-choices">
        {choices
          .filter((choice): choice is Exclude<ReactionChoice, 'ignore'> => choice !== 'ignore')
          .map((choice, index) => (
            <button
              key={choice}
              type="button"
              className={index === 0 ? 'primary-button' : undefined}
              disabled={!canAct || locked}
              onClick={() => {
                use(choice);
              }}
            >
              {button[choice] ?? choice}
            </button>
          ))}
        {choices.includes('ignore') && (
          <button type="button" disabled={!canAct || locked} onClick={decline}>
            {keep}
          </button>
        )}
      </div>
      <p className="reaction-note">{note}</p>
    </section>
  );
}
