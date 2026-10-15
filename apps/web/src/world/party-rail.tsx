import type { EncounterView, EntityKind, EntityRef, PresenceResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { usePortrait } from './use-portrait.ts';

type HitPoints = { readonly current: number; readonly max: number };

/** The share of hit points left, as a bar width (drawn markup, not a picture). */
const share = ({ current, max }: HitPoints) =>
  `${String(Math.max(0, Math.min(100, (100 * current) / Math.max(1, max))))}%`;

function Member({
  api,
  character,
  present,
  hitPoints,
  selected,
  onSelect,
}: {
  readonly api: WorldApi;
  readonly character: EntityRef;
  readonly present: boolean;
  readonly hitPoints: HitPoints | null;
  readonly selected: boolean;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  const image = usePortrait(api, character.entityId);
  const low = hitPoints !== null && hitPoints.current * 2 <= hitPoints.max;
  return (
    <button
      type="button"
      className={`rail-member ${present ? 'present' : 'away'}`}
      aria-pressed={selected}
      onClick={() => {
        onSelect(character.entityId, character.kind);
      }}
    >
      <Medallion image={image} kind={character.kind} size="sm" tone="party" selected={selected} />
      <span className="rail-text" aria-hidden="true">
        <span className="rail-name">{character.name}</span>
        {hitPoints && (
          <span className="rail-hp">
            {hitPoints.current}/{hitPoints.max}
          </span>
        )}
      </span>
      {hitPoints && (
        <span className={`hp-bar${low ? ' hp-bar--low' : ''}`} aria-hidden="true">
          <span style={{ width: share(hitPoints) }} />
        </span>
      )}
      <span className="presence-dot" aria-hidden="true" />
      <span className="visually-hidden">
        {present
          ? t('{name} · connected', { name: character.name })
          : t('{name} · not connected', { name: character.name })}
        {hitPoints
          ? ` · ${t('Hit points: {current} / {max}', { current: hitPoints.current, max: hitPoints.max })}`
          : ''}
      </span>
    </button>
  );
}

/**
 * The party rail (docs/STAGE_320_DESIGN.md §5.2): who is at the table as this perspective may
 * see it (docs/adr/0033-live-session.md §5) — each character's approved portrait or the
 * silhouette, a presence dot, and hit points only while the encounter's projection carries
 * them. Presence is shown, never used to decide anything; nothing while it is loading.
 */
export function PartyRail({
  api,
  encounter,
  selectedId,
  onSelect,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView | null;
  readonly selectedId: string | null;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PresenceResponse>('presence', signal),
    [api],
  );
  const { resource } = useResource('presence', load);
  if (resource.status !== 'ready') return null;
  const { dmConnected, characters } = resource.value;
  const hitPoints = (entityId: string): HitPoints | null =>
    encounter?.combatants.find((entry) => entry.entity.entityId === entityId)?.hitPoints ?? null;
  return (
    <section className="party-rail" aria-label={t('At the table')}>
      <p className={`rail-dm ${dmConnected ? 'present' : 'away'}`}>
        <Glyph name="game-master" />
        <span>{dmConnected ? t('DM connected') : t('DM not connected')}</span>
      </p>
      <ul>
        {characters.map(({ character, present }) => (
          <li key={character.entityId}>
            <Member
              api={api}
              character={character}
              present={present}
              hitPoints={hitPoints(character.entityId)}
              selected={selectedId === character.entityId}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
