import type { CharacterSheetResponse, EncounterView, PlayerAssetView } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';
import { useReservedHeight } from '../../shell/reserved-height.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { Medallion } from '../../visual/medallion.tsx';
import { HpBar } from '../board/token.tsx';
import { conditionGlyph } from '../combat-art.ts';
import { CONDITION_EFFECTS, conditionNoteWords, exhaustionWords } from '../condition-words.ts';
import { useCombatantLabels } from '../labels.ts';

/** The viewer's own sheet, read only while the active combatant is the viewer's character. */
function useOwnSheet(api: WorldApi, characterId: string | null) {
  const load = useCallback(
    (signal: AbortSignal) =>
      characterId === null
        ? Promise.resolve(null)
        : api.get<CharacterSheetResponse>(
            `entities/${encodeURIComponent(characterId)}/sheet`,
            signal,
          ),
    [api, characterId],
  );
  const { resource } = useResource(`own-sheet:${characterId ?? ''}`, load);
  return resource.status === 'ready' ? resource.value : null;
}

/**
 * Whose turn it is (docs/STAGE_320_DESIGN.md §5.5): the active combatant's portrait, name and
 * side, its state and conditions, its hit points when the projection carries them, and armour
 * class, speed and concentration only when it is the viewer's own character, from the
 * viewer's own sheet. Nothing is shown that the perspective does not receive.
 */
export function ActiveCard({
  api,
  encounter,
  actorId,
  imageOf,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string | null;
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
}) {
  const t = useT();
  const active = encounter.combatants.find(
    (entry) => entry.entity.entityId === encounter.currentCombatantId,
  );
  const own = active !== undefined && actorId !== null && active.entity.entityId === actorId;
  const ownSheet = useOwnSheet(api, own ? actorId : null);
  const sheet = ownSheet?.sheet ?? null;
  const labelOf = useCombatantLabels(encounter);
  // Wide, the party rail beneath it keeps clear of it (`battle-layout.css`).
  const card = useReservedHeight<HTMLElement>('--active-h', active !== undefined);
  if (!active) return null;
  return (
    <section
      ref={card}
      className={`active-card active-card--${active.side}`}
      aria-label={t('Active combatant')}
    >
      <header className="active-header">
        <Medallion
          image={imageOf(active.entity.entityId)}
          kind={active.entity.kind}
          size="lg"
          tone={active.side}
          condition={
            active.state === 'dead' ? 'dead' : active.state === 'down' ? 'unconscious' : null
          }
        />
        <div className="active-title">
          <p className="eyebrow">{t(readableLabel(active.side))}</p>
          <h3>{labelOf(active.entity.entityId)}</h3>
          {active.state !== 'up' && (
            <p className="active-state">
              <Glyph name={active.state === 'dead' ? 'dead' : 'unconscious'} />
              {t(readableLabel(active.state))}
            </p>
          )}
        </div>
      </header>
      {active.hitPoints && (
        <div className="active-hp">
          <p>
            <Glyph name="hit-points" />
            <span>{t('Hit points')}</span>
            <strong>
              {active.hitPoints.current} / {active.hitPoints.max}
            </strong>
          </p>
          <HpBar hitPoints={active.hitPoints} />
        </div>
      )}
      {sheet && (
        <dl className="active-stats">
          <div>
            <dt>
              <Glyph name="armor-class" />
              {t('Armor class')}
            </dt>
            <dd>{sheet.armorClass}</dd>
          </div>
          <div>
            <dt>
              <Glyph name="speed" />
              {t('Speed')}
            </dt>
            <dd>{t('{feet} ft', { feet: ownSheet?.derived?.speedFt ?? sheet.speedFt })}</dd>
          </div>
          {sheet.concentration && (
            <div className="active-concentration">
              <dt>
                <Glyph name="concentration" />
                {t('Concentration')}
              </dt>
              <dd>{t(readableLabel(sheet.concentration.spellId))}</dd>
            </div>
          )}
        </dl>
      )}
      {(active.conditions.length > 0 || active.exhaustion !== undefined) && (
        <ul className="active-conditions" aria-label={t('Conditions')}>
          {active.conditions.map((condition) => (
            <li key={condition} title={t(CONDITION_EFFECTS[condition])}>
              <Glyph name={conditionGlyph(condition)} />
              {t(readableLabel(condition))}
            </li>
          ))}
          {active.exhaustion !== undefined && (
            <li title={exhaustionWords(t, active.exhaustion)}>
              <Glyph name="exhaustion" />
              {t('Exhaustion {level}', { level: active.exhaustion })}
            </li>
          )}
        </ul>
      )}
      {/* How each ends and its source, as the viewer knows them (ADR 0045 §2). */}
      {(active.conditionNotes ?? []).length > 0 && (
        <ul className="active-condition-notes" aria-label={t('How they end')}>
          {(active.conditionNotes ?? []).map((note) => (
            <li key={note.condition}>
              <strong>{t(readableLabel(note.condition))}:</strong> {conditionNoteWords(t, note)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
