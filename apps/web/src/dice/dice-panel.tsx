import type { EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { ChatSheet } from '../chat/chat-sheet.tsx';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { unlockAudio } from './audio.ts';
import { AskForCheck, CheckRoller } from './check-forms.tsx';
import { Requests, RollLog } from './requests-log.tsx';
import { RollBuilder } from './roll-builder.tsx';
import { changeDiceSettings, useDiceSettings, type DiceSettings } from './settings.ts';
import { useDiceTable } from './table.tsx';

const MOTION_WORDS: Readonly<Record<DiceSettings['motion'], string>> = {
  auto: 'As my system prefers',
  on: 'Always',
  off: 'Never (results only)',
};

function DiceSettingsForm() {
  const t = useT();
  const settings = useDiceSettings();
  const ids = useId();
  return (
    <details className="disclosure dice-settings">
      <summary>{t('Dice sound and motion')}</summary>
      <label className="dice-toggle">
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(event) => {
            unlockAudio();
            changeDiceSettings({ sound: event.target.checked });
          }}
        />
        <span>{t('Sound of the dice')}</span>
      </label>
      <label htmlFor={`${ids}-volume`}>{t('Volume')}</label>
      <input
        id={`${ids}-volume`}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(settings.volume * 100)}
        disabled={!settings.sound}
        onChange={(event) => {
          changeDiceSettings({ volume: Number(event.target.value) / 100 });
        }}
      />
      <label htmlFor={`${ids}-motion`}>{t('Dice rolling across the screen')}</label>
      <select
        id={`${ids}-motion`}
        value={settings.motion}
        onChange={(event) => {
          changeDiceSettings({ motion: event.target.value as DiceSettings['motion'] });
        }}
      >
        {(Object.keys(MOTION_WORDS) as DiceSettings['motion'][]).map((motion) => (
          <option key={motion} value={motion}>
            {t(MOTION_WORDS[motion])}
          </option>
        ))}
      </select>
    </details>
  );
}

/**
 * The Dice sheet (Stage 510): the DM's requests (to answer, or the DM's own to follow), a free
 * roll, a check from the sheet, the DM's ask, the latest rolls and the viewer's sound and motion.
 */
export function DicePanel({
  shell,
  characters,
}: {
  readonly shell: Shell;
  readonly characters: readonly EntityRef[];
}) {
  const t = useT();
  const table = useDiceTable();
  return (
    <>
      <Sheet
        id="dice"
        title={t('Dice')}
        glyph="roll"
        open={shell.sheet === 'dice'}
        onClose={shell.closeSheet}
      >
        <div className="dice-panel">
          <div className="dice-panel-main">
            <Requests characters={characters} />
            <RollBuilder />
            <CheckRoller />
            <AskForCheck characters={characters} />
            {table?.error && (
              <p className="field-error" role="alert">
                {table.error}
              </p>
            )}
            <DiceSettingsForm />
          </div>
          <div className="dice-panel-log">
            <RollLog />
          </div>
        </div>
      </Sheet>
      {/* The table's talk beside its dice (ADR 0044 §1): one table, its rolls woven in. */}
      <ChatSheet shell={shell} characters={characters} />
    </>
  );
}
