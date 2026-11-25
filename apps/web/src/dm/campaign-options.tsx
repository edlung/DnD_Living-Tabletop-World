import {
  CARRYING,
  HIT_POINTS_AT_LEVEL,
  LEVELS_BY,
  MAX_CRAFT_HELPERS,
  type CampaignOptions,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { CARRYING_WORDS, HIT_POINT_WORDS, LEVEL_WORDS, OPTION_KEYS } from './option-words.ts';
import type { DmTableCommand } from './table-commands.ts';
import { PickTiles } from '../book-kit/pick.tsx';

const LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);
const HELPERS = Array.from({ length: MAX_CRAFT_HELPERS }, (_, index) => index + 1);

/**
 * The campaign's options on the DM's Session sheet (docs/adr/0056-characters-from-the-srd.md §3):
 * a new level's hit points, levels by experience or milestone, carrying shown or enforced, and the
 * level new characters start at, so one who joins later joins at the party's, and how many may help
 * on a crafting project (docs/adr/0057-encounters-maps-loot.md §9). Saved through the
 * World Engine; the DM's history undoes a change. Mounted again for each saved set it reads.
 */
export function CampaignOptionsForm({
  options,
  locked,
  onRun,
}: {
  readonly options: CampaignOptions;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  // Options set before Stage 670f have no helpers' count: one (docs/adr/0057-…md §9).
  const saved = { ...options, craftingHelpers: options.craftingHelpers ?? 1 };
  const [draft, setDraft] = useState<CampaignOptions>(saved);
  const changed = OPTION_KEYS.some((key) => draft[key] !== saved[key]);
  const set = (change: Partial<CampaignOptions>) => {
    setDraft((before) => ({ ...before, ...change }));
  };
  return (
    <section className="tool-group campaign-options" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="settings" />
        {t('Campaign options')}
      </h3>
      <form
        className="hand-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) onRun({ type: 'SetCampaignOptions', options: draft });
        }}
      >
        <div className="account-field">
          <PickTiles
            legend={t('Hit points at a new level')}
            name={`${ids}-hit-points`}
            value={draft.hitPointsAtLevel}
            describedBy={`${ids}-hit-points-hint`}
            options={HIT_POINTS_AT_LEVEL.map((value) => ({
              value,
              label: t(HIT_POINT_WORDS[value]),
              pick: `hp-level-${value}`,
            }))}
            onChange={(hitPointsAtLevel) => {
              set({ hitPointsAtLevel });
            }}
          />
          <p id={`${ids}-hit-points-hint`} className="fine-print">
            {t('Fixed: the class’s fixed value. Rolled: the World Engine rolls the Hit Die.')}
          </p>
        </div>
        <div className="account-field">
          <PickTiles
            legend={t('Levels')}
            name={`${ids}-levels`}
            value={draft.levelsBy}
            describedBy={`${ids}-levels-hint`}
            options={LEVELS_BY.map((value) => ({
              value,
              label: t(LEVEL_WORDS[value]),
              pick: `levels-${value}`,
            }))}
            onChange={(levelsBy) => {
              set({ levelsBy });
            }}
          />
          <p id={`${ids}-levels-hint`} className="fine-print">
            {t('By milestone the DM grants each level, and no experience is counted.')}
          </p>
        </div>
        <div className="account-field">
          <PickTiles
            legend={t('Carrying')}
            name={`${ids}-carrying`}
            value={draft.carrying}
            describedBy={`${ids}-carrying-hint`}
            options={CARRYING.map((value) => ({
              value,
              label: t(CARRYING_WORDS[value]),
              pick: `carrying-${value}`,
            }))}
            onChange={(carrying) => {
              set({ carrying });
            }}
          />
          <p id={`${ids}-carrying-hint`} className="fine-print">
            {t('Enforced: past what Strength carries, Speed is 5 ft; past twice that, 0.')}
          </p>
        </div>
        <Field
          label={t('New characters start at level')}
          hint={t('A character who joins later starts at the party’s level.')}
        >
          {(control) => (
            <select
              {...control}
              value={draft.startingLevel}
              onChange={(event) => {
                set({ startingLevel: Number(event.target.value) });
              }}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('Helpers on a crafting project')}
          hint={t('One, as the SRD has it, unless you allow more.')}
        >
          {(control) => (
            <select
              {...control}
              value={draft.craftingHelpers ?? 1}
              onChange={(event) => {
                set({ craftingHelpers: Number(event.target.value) });
              }}
            >
              {HELPERS.map((count) => (
                <option key={count} value={count}>
                  {count === 1 ? t('One') : t('Up to {count}', { count })}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={!changed || locked}>
            <Glyph name="confirm" />
            {t('Save the options')}
          </button>
        </div>
      </form>
    </section>
  );
}
