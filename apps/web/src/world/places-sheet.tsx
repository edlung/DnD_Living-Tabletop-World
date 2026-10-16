import type { EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * The Places sheet (docs/STAGE_320_DESIGN.md §5.2): which known place the stage shows — a
 * viewing choice that never moves a character (ADR 0026 §4) — and every known destination,
 * each opening its details, where Enter goes there.
 */
export function PlacesSheet({
  shell,
  placeId,
  current,
  locations,
  onView,
  onExplore,
}: {
  readonly shell: Shell;
  readonly placeId: string;
  /** The place the stage shows, when it is not among the known locations (perceived only). */
  readonly current: EntityRef | null;
  readonly locations: readonly EntityRef[] | null;
  readonly onView: (placeId: string) => void;
  readonly onExplore: (place: EntityRef) => void;
}) {
  const t = useT();
  return (
    <Sheet
      id="places"
      title={t('Places')}
      glyph="map"
      open={shell.sheet === 'places'}
      onClose={shell.closeSheet}
    >
      {locations && (
        <div className="places">
          <div className="field">
            <label htmlFor="location">{t('Location')}</label>
            <select
              id="location"
              value={placeId}
              disabled={locations.length === 0 && !current}
              onChange={(event) => {
                onView(event.target.value);
              }}
            >
              {!current && locations.length === 0 && (
                <option value="">{t('No known locations')}</option>
              )}
              {current && <option value={current.entityId}>{current.name}</option>}
              {locations.map((place) => (
                <option key={place.entityId} value={place.entityId}>
                  {place.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              {t('Shows another place you know. It does not move your character.')}
            </p>
          </div>
          <section className="sheet-section" aria-labelledby="known-destinations">
            <h3 id="known-destinations">{t('Known destinations')}</h3>
            <ul className="place-list">
              {locations.map((place) => (
                <li key={place.entityId}>
                  <button
                    type="button"
                    className="list-button"
                    aria-label={t('Explore {place}', { place: place.name })}
                    aria-current={place.entityId === placeId ? 'location' : undefined}
                    onClick={() => {
                      onExplore(place);
                    }}
                  >
                    <Glyph name="place" />
                    <span>{place.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {locations.length === 0 && (
              <p className="muted">{t('There are no known locations in this perspective yet.')}</p>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
