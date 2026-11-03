import type {
  CharacterOptionsResponse,
  CharacterSheet,
  EntityRef,
  LevelOptionsResponse,
} from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useEffect, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
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
        {t('{experience} XP; level {next} at {needed} XP.', {
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

/** The DM's experience for the party: an amount divided evenly among the characters ticked. */
export function AwardExperience({
  api,
  characters,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
}) {
  const t = useT();
  const ids = useId();
  const number = new Intl.NumberFormat(useLanguage());
  const [amount, setAmount] = useState('');
  // Those left out: a character who joins later is ticked.
  const [left, setLeft] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const chosen = characters.map((one) => one.entityId).filter((id) => !left.includes(id));
  const value = Number(amount);
  return (
    <section className="sheet-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Experience')}</h3>
      <p className="muted">
        {t('What the party earned, divided evenly among those who earned it.')}
      </p>
      <form
        className="hand-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void api
            .post<{ share: number }>(
              'experience',
              { requestId: crypto.randomUUID(), amount: value, characterIds: chosen },
              new AbortController().signal,
              true,
            )
            .then((answer) => {
              setNote(t('{share} XP to each.', { share: number.format(answer.share) }));
              setAmount('');
            })
            .catch(() => {
              setNote(t('The experience could not be awarded.'));
            });
        }}
      >
        <Field label={t('Experience points')}>
          {(control) => (
            <input
              {...control}
              inputMode="numeric"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value.replace(/\D/g, '').slice(0, 7));
              }}
            />
          )}
        </Field>
        <fieldset className="hand-choice">
          <legend>{t('Who earned it')}</legend>
          {characters.map((one) => (
            <label key={one.entityId}>
              <input
                type="checkbox"
                checked={!left.includes(one.entityId)}
                onChange={(event) => {
                  setLeft((before) =>
                    event.target.checked
                      ? before.filter((id) => id !== one.entityId)
                      : [...before, one.entityId],
                  );
                }}
              />
              {one.name}
            </label>
          ))}
        </fieldset>
        <div className="action-row">
          <button
            type="submit"
            className="primary-button"
            disabled={!(value > 0) || value > 1_000_000 || chosen.length === 0}
          >
            <Glyph name="party" />
            {t('Award, divided evenly')}
          </button>
        </div>
        {note && <p role="status">{note}</p>}
      </form>
    </section>
  );
}
