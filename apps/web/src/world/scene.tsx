import type { EntityKind, EntityRef, ScenePresentationResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import type { ReactNode } from 'react';

import type { Resource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';
import { Glyph } from '../visual/glyph.tsx';
import { phaseGlyph, weatherGlyph } from '../visual/glyph-map.ts';
import { SceneObjects } from './scene-objects.tsx';

export interface NearbyPlace {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string | null;
}

function Exits({
  nearby,
  onSelect,
  hint,
}: {
  readonly nearby: readonly NearbyPlace[];
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
  readonly hint?: ReactNode;
}) {
  const t = useT();
  return (
    <section className="exits" aria-label={t('Nearby places')}>
      <h3>{t('Beyond this place')}</h3>
      <p className="exits-hint">
        {hint ?? t('Choose a place to look at it. To go there, use Enter in its details.')}
      </p>
      <ul>
        {nearby.map((place) => {
          const name = place.name ?? t('Unidentified location');
          return (
            <li key={place.entityId}>
              <button
                type="button"
                className="exit-button"
                aria-label={t('Explore {place}', { place: name })}
                onClick={() => {
                  onSelect(place.entityId, place.kind);
                }}
              >
                <Glyph name="travel" />
                <span className="exit-text">
                  <span className="exit-verb">{t('Explore')}</span>
                  <strong>{name}</strong>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The scene (docs/STAGE_320_DESIGN.md §5.2): the place's cartouche with its conditions, who is
 * present as medallions along the lower third, and the ways beyond this place. While the stage
 * shows the battlefield only the cartouche stays; the rest is kept, hidden.
 */
export function Scene({
  location,
  scene,
  onRetry,
  directory,
  nearby,
  selectedId,
  onSelect,
  battlefield,
  rail,
  conversation,
  notice,
  nearbyHint,
  missingImageNote,
}: {
  readonly location: EntityRef;
  readonly scene: Resource<ScenePresentationResponse | null>;
  readonly onRetry: () => void;
  readonly directory: readonly EntityRef[];
  readonly nearby: readonly NearbyPlace[];
  readonly selectedId: string | null;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
  /** The stage shows the battlefield: the presence row steps aside. */
  readonly battlefield: boolean;
  /** Who is at the table, beside the place's cartouche. */
  readonly rail: ReactNode;
  /** The conversation with an NPC of this scene, when one is open. */
  readonly conversation: ReactNode;
  /** What the table changed under the viewer (the DM's undo of their action), in the cartouche. */
  readonly notice?: ReactNode;
  readonly nearbyHint?: ReactNode;
  readonly missingImageNote?: ReactNode;
}) {
  const t = useT();
  const view = scene.status === 'ready' ? scene.value : null;
  return (
    <section className="scene" aria-label={t('Scene')}>
      <header className="cartouche">
        <h2>{location.name}</h2>
        {view && (
          <div className="conditions" role="group" aria-label={t('Scene conditions')}>
            <span>{formatWorldTime(view.worldTime, t)}</span>
            <span>
              <Glyph name={phaseGlyph(view.phase)} />
              {t(view.phase)}
            </span>
            {view.location.weather && (
              <span>
                <Glyph name={weatherGlyph(view.location.weather)} />
                {t(view.location.weather)}
              </span>
            )}
          </div>
        )}
        {/* On a phone the art does not scroll with the scene: the note rides in the cartouche. */}
        {view && !view.location.image && (
          <p className="cartouche-note">{missingImageNote ?? t('No approved image yet')}</p>
        )}
        {notice}
      </header>
      {rail}
      <div className="scene-presence" id="scene-presence" hidden={battlefield}>
        <h3 className="visually-hidden">{t('In this scene')}</h3>
        {scene.status !== 'ready' ? (
          <StatusPanel
            state={scene.status}
            label={scene.status === 'error' ? scene.message : t('Loading the scene…')}
            onRetry={onRetry}
          />
        ) : !view?.location.observed ? (
          <StatusPanel
            state="empty"
            label={t('This location is known, but it is not observed in this perspective.')}
          />
        ) : view.present.length === 0 ? (
          <StatusPanel state="empty" label={t('No entities are visible in this scene.')} />
        ) : (
          <SceneObjects
            present={view.present}
            directory={directory}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
        <p className="scene-caption">
          <span className="scene-hint">{t('Choose a person or object to look closer.')}</span>
          <span>{t('Symbolic arrangement — no distances shown')}</span>
        </p>
      </div>
      {conversation}
      {nearby.length > 0 && !battlefield && (
        <Exits nearby={nearby} onSelect={onSelect} hint={nearbyHint} />
      )}
    </section>
  );
}
