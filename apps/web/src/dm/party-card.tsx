import type { CharacterSheetResponse, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { checkWords } from '../dice/checks.ts';
import { useDiceTable } from '../dice/table.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { usePortrait } from '../world/use-portrait.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { ConditionForm, HitPointsForm, InspirationForm, type HandForm } from './hand-forms.tsx';
import { CONDITION_WORDS } from './hand-words.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * One character on the DM's Party sheet (docs/adr/0043-dm-screen.md §3): portrait and presence,
 * hit points, Armor Class, conditions, Heroic Inspiration, the passive scores, spell slots and,
 * while dying, the death saves — read from the character's sheet in the DM perspective — and the
 * DM's hand on it: damage or healing, a condition, inspiration, its full sheet.
 */
const SLOT_WORDS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'] as const;

export function PartyCard({
  api,
  character,
  present,
  revision,
  locked,
  onRun,
  onOpenSheet,
}: {
  readonly api: WorldApi;
  readonly character: EntityRef;
  readonly present: boolean;
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
  readonly onOpenSheet: (entityId: string) => void;
}) {
  const t = useT();
  const ids = useId();
  const image = usePortrait(api, character.entityId);
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<CharacterSheetResponse>(
        `entities/${encodeURIComponent(character.entityId)}/sheet`,
        signal,
      ),
    [api, character.entityId],
  );
  const read = useResource(`party-card:${character.entityId}`, load);
  useRereadOn(revision, read.reread);
  const [form, setForm] = useState<HandForm | null>(null);
  const view = read.resource.status === 'ready' ? read.resource.value : null;
  const sheet = view?.sheet ?? null;
  const send = (command: DmTableCommand) => {
    setForm(null);
    onRun(command);
  };
  // Whom the table waits for (ADR 0044 §3): the checks asked of this character, not yet rolled.
  const table = useDiceTable();
  const asked =
    table?.requests.status === 'ready'
      ? table.requests.value.requests.filter(
          (request) => request.status === 'open' && request.characterId === character.entityId,
        )
      : [];
  const hp = sheet?.hitPoints;
  const low = hp !== undefined && hp.current * 2 <= hp.max;
  const slots = sheet
    ? sheet.spellSlots.max.flatMap((max, level) =>
        max > 0
          ? [
              t('{level}: {left}/{max}', {
                level: t(SLOT_WORDS[level] ?? ''),
                left: max - (sheet.spellSlots.expended[level] ?? 0),
                max,
              }),
            ]
          : [],
      )
    : [];
  return (
    <li className="party-card" aria-labelledby={`${ids}-name`}>
      <div className="party-card-head">
        <Medallion image={image} kind="character" size="sm" tone="party" />
        <div className="party-card-title">
          <strong id={`${ids}-name`}>{character.name}</strong>
          <span className={`presence-label ${present ? 'present' : 'away'}`}>
            {present ? t('connected') : t('not connected')}
          </span>
        </div>
        {sheet?.heroicInspiration && (
          <span className="status-pill inspired">
            <Glyph name="blessing" />
            {t('Inspired')}
          </span>
        )}
      </div>
      {asked.length > 0 && (
        <p className="party-waiting" role="status">
          <Glyph name="roll" />
          {t('Waiting for: {checks}', {
            checks: asked.map((request) => checkWords(t, request.check, request.mode)).join(', '),
          })}
        </p>
      )}
      {sheet && hp ? (
        <>
          <div className="party-card-vitals">
            <span className="party-hp">
              <span className="visually-hidden">{t('Hit points')}</span>
              <Glyph name="hit-points" />
              {hp.current}/{hp.max}
            </span>
            <span className={`hp-bar${low ? ' hp-bar--low' : ''}`} aria-hidden="true">
              <span
                style={{
                  width: `${String(Math.max(0, Math.min(100, (100 * hp.current) / hp.max)))}%`,
                }}
              />
            </span>
            <span className="party-ac">
              <Glyph name="armor-class" />
              {t('AC {value}', { value: sheet.armorClass })}
            </span>
          </div>
          <p className="party-conditions">
            {sheet.conditions.length === 0
              ? t('No conditions')
              : sheet.conditions.map((condition) => t(CONDITION_WORDS[condition])).join(' · ')}
          </p>
          {sheet.deathSaves && (
            <p className="party-dying" role="status">
              {t('Dying: {successes} successes, {failures} failures', sheet.deathSaves)}
            </p>
          )}
          {view?.derived && (
            <p className="party-passive">
              {t(
                'Passive Perception {perception} · Insight {insight} · Investigation {investigation}',
                {
                  ...view.derived.passive,
                },
              )}
            </p>
          )}
          {slots.length > 0 && (
            <p className="party-slots">{t('Slots: {slots}', { slots: slots.join(' · ') })}</p>
          )}
        </>
      ) : (
        <p className="muted">
          {read.resource.status === 'error' ? read.resource.message : t('Reading the sheet…')}
        </p>
      )}
      <div className="action-row party-card-actions">
        {(
          [
            ['hit-points', 'Damage or heal', 'hit-points'],
            ['condition', 'Condition', 'incapacitated'],
            ['inspiration', 'Inspiration', 'blessing'],
          ] as const
        ).map(([id, word, glyph]) => (
          <button
            key={id}
            type="button"
            disabled={!sheet}
            aria-expanded={form === id}
            aria-label={t('{action}: {name}', { action: t(word), name: character.name })}
            onClick={() => {
              setForm(form === id ? null : id);
            }}
          >
            <Glyph name={glyph} />
            {t(word)}
          </button>
        ))}
        <button
          type="button"
          className="quiet-button"
          aria-label={t('Open the sheet of {name}', { name: character.name })}
          onClick={() => {
            onOpenSheet(character.entityId);
          }}
        >
          {t('Sheet')}
        </button>
      </div>
      {sheet && form !== null && (
        <FormFor
          form={form}
          characterId={character.entityId}
          name={character.name}
          sheet={sheet}
          locked={locked}
          onSend={send}
          onCancel={() => {
            setForm(null);
          }}
        />
      )}
    </li>
  );
}

function FormFor({
  form,
  ...props
}: { readonly form: HandForm } & Parameters<typeof HitPointsForm>[0]) {
  switch (form) {
    case 'hit-points':
      return <HitPointsForm {...props} />;
    case 'condition':
      return <ConditionForm {...props} />;
    case 'inspiration':
      return <InspirationForm {...props} />;
  }
}
