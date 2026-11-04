import { LIGHT_LEVELS, type EncounterView, type LightLevel } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';

const WORDS: Readonly<Record<LightLevel, string>> = {
  bright: 'Bright',
  dim: 'Dim',
  dark: 'Darkness',
};

/**
 * The light of the running fight (docs/adr/0050-the-world-around.md §1): the DM's three choices —
 * a torch put out, the dawn. The rules see by it; squares the battlefield lights otherwise keep
 * their own.
 */
export function LightControl({
  encounter,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const current = encounter.battlefield.ambient ?? 'bright';
  return (
    <fieldset className="tool-card light-control">
      <legend>
        <Glyph name="day" />
        {t('Light of the fight')}
      </legend>
      <div className="action-row">
        {LIGHT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={current === level}
            disabled={locked}
            onClick={() => {
              if (current !== level) {
                onRun({ kind: 'command', command: { type: 'SetLight', ambient: level } });
              }
            }}
          >
            {t(WORDS[level])}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
