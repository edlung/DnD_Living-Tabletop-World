import { HAZARDS, type Hazard } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';

const WORDS: Readonly<Record<Hazard, string>> = {
  cold: 'Extreme cold',
  heat: 'Extreme heat',
};

/**
 * The hazards of the road (docs/adr/0050-the-world-around.md §8), in the Time and weather sheet:
 * the DM exposes the party to Extreme Cold or Extreme Heat for some hours; the server rolls each
 * character's Constitution save each hour, a failure a level of Exhaustion. No hazard in a fight.
 */
export function DmHazardControls({
  locked,
  fighting,
  onRun,
}: {
  readonly locked: boolean;
  readonly fighting: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const [hazard, setHazard] = useState<Hazard>('cold');
  const [hours, setHours] = useState(1);
  return (
    <section className="tool-group" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="weather" />
        {t('Hazards of the road')}
      </h3>
      <p className="muted">
        {t(
          'Each hour every character makes a Constitution save — cold DC 10, heat DC 5 and 1 more each hour — or gains a level of Exhaustion.',
        )}
      </p>
      <div className="hazard-row">
        <label className="hazard-field">
          <span>{t('Hazard')}</span>
          <select
            value={hazard}
            onChange={(event) => {
              setHazard(event.target.value as Hazard);
            }}
          >
            {HAZARDS.map((option) => (
              <option key={option} value={option}>
                {t(WORDS[option])}
              </option>
            ))}
          </select>
        </label>
        <label className="hazard-field">
          <span>{t('Hours')}</span>
          <select
            value={hours}
            onChange={(event) => {
              setHours(Number(event.target.value));
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={locked || fighting}
          onClick={() => {
            onRun({
              kind: 'command',
              command: { type: 'ExposeToHazard', hazard, hours, reason: t(WORDS[hazard]) },
            });
          }}
        >
          {t('Expose the party for {hours} h', { hours })}
        </button>
      </div>
    </section>
  );
}
