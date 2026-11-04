import type {
  CharacterOptionsResponse,
  CharacterSheet,
  LevelOptionsResponse,
} from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useEffect, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import { LevelDialog } from './level-dialog.tsx';

/**
 * Experience and levels on a character's overview (docs/adr/0056-characters-from-the-srd.md §3):
 * its experience against the next level's, a level the DM granted, and the way to take it; the DM
 * may grant a level to take.
 */
export function LevelSection({
  api,
  characterId,
  sheet,
  own,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly sheet: CharacterSheet;
  /** The viewer plays this character; else only the DM sees the section. */
  readonly own: boolean;
  /** The sheet changed here: the dialog reads it again. */
  readonly onChanged: () => void;
}) {
  const t = useT();
  const ids = useId();
  const number = new Intl.NumberFormat(useLanguage());
  const isDm = useDiceTable()?.isDm ?? false;
  const [levels, setLevels] = useState<LevelOptionsResponse | null>(null);
  const [options, setOptions] = useState<CharacterOptionsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const shown = own || isDm;
  // What the levels depend on, as a stable key: the sheet object is new at every read.
  const key = `${sheet.classes.map((entry) => `${entry.classId}${String(entry.level)}`).join()}:${String(sheet.experience ?? 0)}:${String(sheet.pendingLevels ?? 0)}`;
  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    api
      .get<LevelOptionsResponse>(
        `characters/${encodeURIComponent(characterId)}/level-options`,
        controller.signal,
      )
      .then(setLevels)
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [api, characterId, round, key, shown]);
  const openDialog = () => {
    setNote(null);
    if (options) {
      setOpen(true);
      return;
    }
    void api
      .get<CharacterOptionsResponse>('character-options', new AbortController().signal, false)
      .then((value) => {
        setOptions(value);
        setOpen(true);
      })
      .catch(() => {
        setNote(t('The choices could not be read.'));
      });
  };
  if (!shown || !levels || levels.level >= 20) return null;
  const next = levels.level + 1;
  return (
    <section className="hero-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Experience and levels')}</h3>
      <p className="muted">
        {/* Levels by milestone count no experience (docs/adr/0056-characters-from-the-srd.md §3). */}
        {levels.options.levelsBy === 'milestone'
          ? t('Levels by milestone: the DM grants each level.')
          : t('{experience} XP; level {next} at {needed} XP.', {
              experience: number.format(levels.experience),
              next,
              needed: number.format(levels.nextAt),
            })}
        {levels.pendingLevels > 0
          ? ` ${t('Levels granted by the DM to take: {count}.', { count: levels.pendingLevels })}`
          : ''}
      </p>
      {note && <p role="status">{note}</p>}
      <div className="action-row">
        {levels.ready && (
          <button type="button" onClick={openDialog}>
            {t('Take level {level}', { level: next })}
          </button>
        )}
        {isDm && (
          <button
            type="button"
            onClick={() => {
              void api
                .post(
                  `characters/${encodeURIComponent(characterId)}/milestone`,
                  { requestId: crypto.randomUUID() },
                  new AbortController().signal,
                  true,
                )
                .then(() => {
                  setNote(t('A level is granted to take.'));
                  setRound((value) => value + 1);
                  onChanged();
                })
                .catch(() => {
                  setNote(t('The level could not be granted.'));
                });
            }}
          >
            {t('Grant a level to take')}
          </button>
        )}
      </div>
      {/* Mounted while open: each opening starts from the level the character is at now. */}
      {options && open && (
        <LevelDialog
          api={api}
          characterId={characterId}
          sheet={sheet}
          levels={levels}
          options={options}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          onTaken={() => {
            setOpen(false);
            setNote(t('Level {level} is taken.', { level: next }));
            setRound((value) => value + 1);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
