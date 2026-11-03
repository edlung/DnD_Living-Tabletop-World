import type {
  CombatAction,
  ContextAction,
  ContextSpell,
  EncounterCombatantView,
  EncounterView,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import type { ExplorationIntent } from '../../exploration/use-action.ts';
import { useReservedHeight } from '../../shell/reserved-height.ts';
import { actionGlyph } from '../../visual/glyph-map.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { useScrollEdges } from '../../visual/scroll-edges.ts';
import { optionArtUrl, optionLabelFor, shortLabelFor } from '../combat-art.ts';
import { CHOSEN_ACTIONS, combatCommandFor, type CombatUiCommand } from '../combat-bindings.ts';
import { useCombatantLabels } from '../labels.ts';
import { flightMoves, type MoveOption } from '../move-options.ts';
import { moveGlyph, moveLabel, moveNote } from '../move-words.ts';
import { optionNotes, warnsOfAlly } from '../target-options.tsx';
import { ActionChoice } from './action-choice.tsx';
import { SpellChoice } from './spell-choice.tsx';
import {
  AttackChoice,
  masteryQuestion,
  unarmedQuestion,
  type AttackQuestion,
} from './attack-choice.tsx';

/**
 * What the tray offers: the ways to the chosen square (docs/adr/0049-space-and-movement.md
 * §5–8), or the chosen combatant's listed options.
 */
export type TrayChoice =
  | { readonly kind: 'none' }
  | { readonly kind: 'square'; readonly moves: readonly MoveOption[] }
  | {
      readonly kind: 'combatant';
      readonly target: EncounterCombatantView;
      /** The server's options for it; null while they load. */
      readonly actions: readonly ContextAction[] | null;
    };

/**
 * The turn tray (docs/STAGE_320_DESIGN.md §5.5): shown only while the viewer may act — never a
 * permanent action bar. It holds the server-listed options for what is chosen, each as its
 * catalog picture or glyph with short words (its full words are its name, and its details in
 * the side panel describe it), the advisory move to a chosen square, and End turn. Each button
 * submits the existing command; the rules decide. Below 1200 px the side panel sits under the
 * board, out of view, so the tray also shows what matters at the moment of choosing: each
 * option's cost, range note or reason it is unavailable under its button, and the warning that
 * an area includes a party member above them (the panel's own alert announces it; these are its
 * visible echo).
 */
export function TurnTray({
  encounter,
  actorId,
  choice,
  locked,
  detailId,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly actorId: string;
  readonly choice: TrayChoice;
  readonly locked: boolean;
  /** The side panel's description of an option, by its place in the list. */
  readonly detailId: (index: number) => string;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const labelOf = useCombatantLabels(encounter);
  const tray = useReservedHeight<HTMLElement>('--tray-h', true);
  // An action that asks more first (ADR 0045 §5), for the creature now chosen.
  const [choosing, setChoosing] = useState<CombatAction | null>(null);
  // An attack that asks first (docs/adr/0047-weapons.md): Push's feet, Topple, a strike without
  // a weapon's way.
  const [aiming, setAiming] = useState<{
    readonly key: string;
    readonly question: AttackQuestion;
    readonly command: Extract<CombatUiCommand, { type: 'Attack' }>;
  } | null>(null);
  // A spell that more than one slot could pay for asks which (docs/adr/0052-spells-as-data.md §3).
  const [slotting, setSlotting] = useState<{
    readonly key: string;
    readonly spell: ContextSpell;
  } | null>(null);
  // Melee attacks knock out instead of killing while this is on (docs/adr/0048-hit-points.md §4).
  const [sparing, setSparing] = useState(false);
  const chosen = choice.kind === 'combatant' ? choice.target.entity.entityId : choice.kind;
  useEffect(() => {
    setChoosing(null);
    setAiming(null);
    setSlotting(null);
  }, [chosen]);
  // On a phone the row scrolls sideways; its edges fade where more options hide.
  const row = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(
    row,
    choice.kind === 'combatant' ? `${chosen}:${String(choice.actions?.length ?? -1)}` : chosen,
  );
  const warned = choice.kind === 'combatant' && (choice.actions?.some(warnsOfAlly) ?? false);
  // The ways to the chosen square; with nothing chosen or itself, a flyer's rising and coming
  // down where it is (docs/adr/0049-space-and-movement.md §6).
  const itself =
    choice.kind === 'none' ||
    (choice.kind === 'combatant' && choice.target.entity.entityId === actorId);
  const moves =
    choice.kind === 'square' ? choice.moves : itself ? flightMoves(encounter, actorId) : [];
  const hint =
    choice.kind === 'none'
      ? t('Choose a square to move, or a combatant to act.')
      : choice.kind === 'combatant' && choice.actions === null
        ? t('Checking what you can do…')
        : choice.kind === 'combatant' && choice.actions?.length === 0
          ? t('Nothing to do with this combatant.')
          : null;
  return (
    <section ref={tray} className="turn-tray" aria-label={t('Turn actions')}>
      {warned && (
        <p className="tray-warning" aria-hidden="true">
          <Glyph name="warning" />
          {t('Warning: this area includes a party member. You may still cast it.')}
        </p>
      )}
      {choice.kind === 'combatant' &&
        choice.target.object === undefined &&
        (choice.actions?.some((action) => ATTACK_OPTIONS.has(action.id)) ?? false) && (
          <label className="tray-toggle">
            <input
              type="checkbox"
              checked={sparing}
              onChange={(event) => {
                setSparing(event.target.checked);
              }}
            />
            {t('Knock out instead of killing (melee)')}
          </label>
        )}
      <div
        ref={row}
        className="tray-row"
        data-more-before={edges.before || undefined}
        data-more-after={edges.after || undefined}
      >
        {hint && <p className="tray-hint">{hint}</p>}
        {choice.kind === 'square' && choice.moves.length === 0 && (
          <button type="button" className="tray-action" disabled>
            <Glyph name="move" className="tray-glyph" />
            <span className="tray-words">{t('Move here')}</span>
          </button>
        )}
        {moves.map((option) => (
          <button
            key={option.kind}
            type="button"
            className="tray-action"
            data-move={option.kind}
            disabled={locked}
            onClick={() => {
              const [square] = option.path;
              onRun({
                kind: 'command',
                // Getting down from a mount is an action of its own (ADR 0049 §10).
                command:
                  option.kind === 'dismount' && square
                    ? {
                        type: 'TakeAction',
                        combatantId: actorId,
                        action: 'dismount',
                        square: { x: square.x, y: square.y },
                      }
                    : {
                        type: 'MoveCombatant',
                        combatantId: actorId,
                        path: [...option.path],
                        ...(option.crawl ? { crawl: true } : {}),
                      },
              });
            }}
          >
            <Glyph name={moveGlyph(option)} className="tray-glyph" />
            <span className="tray-words">{moveLabel(t, option)}</span>
            {moveNote(t, option) && (
              <small className="tray-note" aria-hidden="true">
                {moveNote(t, option)}
              </small>
            )}
          </button>
        ))}
        {choice.kind === 'combatant' &&
          choice.actions?.map((action, index) => {
            const { target } = choice;
            const listed = combatCommandFor(
              action,
              actorId,
              { entityId: target.entity.entityId, position: target.position },
              encounter,
            );
            const command =
              listed?.type === 'Attack' && sparing ? { ...listed, knockOut: true } : listed;
            const url = optionArtUrl(action);
            const notes = optionNotes(t, action);
            const asks = action.legal && CHOSEN_ACTIONS.has(action.id);
            const key = `${action.id}:${action.weapon ?? ''}:${String(index)}`;
            // Push and Topple ask their choice first, and a strike without a weapon its way; an
            // object takes no mastery, grapple or shove (docs/adr/0048-hit-points.md §5).
            const thing = target.object !== undefined;
            const question =
              action.id === 'unarmed_strike'
                ? unarmedQuestion(t, thing)
                : !thing && (action.mastery === 'push' || action.mastery === 'topple')
                  ? masteryQuestion(t, action.mastery)
                  : null;
            const aim =
              action.legal && command?.type === 'Attack' && question !== null
                ? { key, question, command }
                : null;
            // A choice first: its slot, or the Metamagic a Sorcerer could spend on it (ADR 0056 §4).
            const slots =
              action.legal &&
              action.spell &&
              (action.spell.slots.length > 1 || (action.spell.metamagic?.length ?? 0) > 0)
                ? action.spell
                : null;
            return (
              <button
                key={key}
                type="button"
                className="tray-action"
                aria-label={optionLabelFor(t, action, labelOf(target.entity.entityId))}
                aria-describedby={detailId(index)}
                aria-expanded={
                  asks
                    ? choosing === action.id
                    : aim
                      ? aiming?.key === key
                      : slots
                        ? slotting?.key === key
                        : undefined
                }
                disabled={locked || (command === null && !asks)}
                onClick={() => {
                  if (asks) {
                    setAiming(null);
                    setChoosing(choosing === action.id ? null : (action.id as CombatAction));
                  } else if (aim) {
                    setChoosing(null);
                    setAiming(aiming?.key === key ? null : aim);
                  } else if (slots) {
                    setChoosing(null);
                    setAiming(null);
                    setSlotting(slotting?.key === key ? null : { key, spell: slots });
                  } else if (command) onRun({ kind: 'command', command });
                }}
              >
                {url ? (
                  <img className="tray-art" src={url} alt="" draggable={false} />
                ) : (
                  <Glyph name={actionGlyph(action.id)} className="tray-glyph" />
                )}
                <span className="tray-words" aria-hidden="true">
                  {shortLabelFor(t, action)}
                </span>
                {notes.length > 0 && (
                  <small className="tray-note" aria-hidden="true">
                    {notes.join(' · ')}
                  </small>
                )}
              </button>
            );
          })}
        <button
          type="button"
          className="tray-end"
          disabled={locked}
          onClick={() => {
            onRun({ kind: 'command', command: { type: 'EndTurn', combatantId: actorId } });
          }}
        >
          <Glyph name="end-turn" className="tray-glyph" />
          <span className="tray-words">{t('End turn')}</span>
        </button>
      </div>
      {aiming !== null && (
        <AttackChoice
          question={aiming.question}
          command={aiming.command}
          locked={locked}
          onRun={(intent) => {
            setAiming(null);
            onRun(intent);
          }}
          onCancel={() => {
            setAiming(null);
          }}
        />
      )}
      {slotting !== null && choice.kind === 'combatant' && (
        <SpellChoice
          spell={slotting.spell}
          actorId={actorId}
          target={{ entityId: choice.target.entity.entityId, position: choice.target.position }}
          locked={locked}
          onRun={(intent) => {
            setSlotting(null);
            onRun(intent);
          }}
          onCancel={() => {
            setSlotting(null);
          }}
        />
      )}
      {choosing !== null && choice.kind === 'combatant' && (
        <ActionChoice
          action={choosing}
          actorId={actorId}
          targetId={
            choice.target.entity.entityId === actorId ? null : choice.target.entity.entityId
          }
          attacks={(choice.actions ?? []).filter(
            (option) => option.id === 'longbow_attack' || option.id === 'weapon_attack',
          )}
          locked={locked}
          onRun={(intent) => {
            setChoosing(null);
            onRun(intent);
          }}
          onCancel={() => {
            setChoosing(null);
          }}
        />
      )}
    </section>
  );
}

/** The options that attack: the knock-out choice applies to their melee strikes. */
const ATTACK_OPTIONS: ReadonlySet<string> = new Set([
  'longbow_attack',
  'weapon_attack',
  'offhand_attack',
  'cleave_attack',
  'unarmed_strike',
]);
