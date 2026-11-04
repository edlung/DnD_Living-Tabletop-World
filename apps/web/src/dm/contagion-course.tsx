import type { ContagionId, ContagionState } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { CONTAGION_WORDS } from '../rules/toolbox-words.ts';
import type { DmTableCommand } from './table-commands.ts';

/** When the character fights it; Sight Rot has no save, only magic or an ointment. */
const FIGHT: Readonly<Record<ContagionId, string | null>> = {
  'cackle-fever': 'Fight it after a Long Rest',
  'sewer-plague': 'Fight it at dawn',
  'sight-rot': null,
};

/**
 * A character's magical contagions on the DM's party card (docs/adr/0055-rules-reference-and-
 * toolbox.md §4): how far each has gone, and its next step as the DM says when — it takes hold,
 * the character fights it (at dawn, or after a Long Rest: the World Engine rolls the save), or
 * magic ends it.
 */
export function ContagionCourse({
  characterId,
  name,
  contagions,
  locked,
  onRun,
}: {
  readonly characterId: string;
  readonly name: string;
  readonly contagions: readonly ContagionState[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  if (contagions.length === 0) return null;
  const step = (contagionId: ContagionId, next: 'takes-hold' | 'fight' | 'cure') => () => {
    onRun({ type: 'ContagionCourse', targetId: characterId, contagionId, step: next });
  };
  return (
    <ul className="party-contagions" aria-label={t('Contagions')}>
      {contagions.map((one) => {
        const disease = t(CONTAGION_WORDS[one.contagionId]);
        const fight = FIGHT[one.contagionId];
        const where = (action: string) => t('{action}: {name}', { action, name });
        return (
          <li key={one.contagionId}>
            <p>
              {!one.takenHold
                ? t('{disease}: not taken hold yet', { disease })
                : one.successes > 0
                  ? t('{disease}: {count} of 3 saves won', { disease, count: one.successes })
                  : t('{disease}: taken hold', { disease })}
            </p>
            <div className="action-row">
              {!one.takenHold && (
                <button
                  type="button"
                  disabled={locked}
                  aria-label={where(t('It takes hold'))}
                  onClick={step(one.contagionId, 'takes-hold')}
                >
                  {t('It takes hold')}
                </button>
              )}
              {one.takenHold && fight && (
                <button
                  type="button"
                  disabled={locked}
                  aria-label={where(t(fight))}
                  onClick={step(one.contagionId, 'fight')}
                >
                  {t(fight)}
                </button>
              )}
              <button
                type="button"
                disabled={locked}
                aria-label={where(t('End it'))}
                onClick={step(one.contagionId, 'cure')}
              >
                {t('End it')}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
