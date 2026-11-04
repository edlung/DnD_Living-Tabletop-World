import {
  ENTITY_STATUSES,
  type EntityKind,
  type EntityRef,
  type EntityStatus,
  type StatBlockResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';
import { useDmImages } from '../../images/dm-images.ts';
import { useRereadOn } from '../../world/use-world-data.ts';
import type { DmTableCommand } from '../table-commands.ts';

const STATUS_WORDS: Readonly<Record<EntityStatus, string>> = {
  active: 'In the world',
  dead: 'Dead',
  destroyed: 'Gone from the world',
};

/**
 * The DM's hand on a thing of the world (docs/adr/0058-campaign-content.md §1), in its card: its
 * name and words (a person's go through the NPC card's proposal), where it is, whether it is still
 * in the world, and a creature's Armor Class, Hit Points and Speed — each a World Engine command the
 * DM's history lists and undoes.
 */
export function ChangeByHand({
  api,
  entity,
  directory,
  revision,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly entity: EntityRef;
  readonly directory: readonly EntityRef[];
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const kind: EntityKind = entity.kind;
  const movable = kind === 'npc' || kind === 'creature' || kind === 'item';
  // Its recorded words, from the DM's lineage (what the image model reads), as the NPC card has them.
  const images = useDmImages();
  const lineage = images?.lineage.status === 'ready' ? images.lineage.value : null;
  const description =
    lineage?.descriptions.find((one) => one.entityId === entity.entityId)?.description ?? '';
  const [draft, setDraft] = useState<{ name: string; words: string } | null>(null);
  const { name, words } = draft ?? { name: entity.name, words: description };
  const setName = (next: string) => {
    setDraft({ name: next, words });
  };
  const setWords = (next: string) => {
    setDraft({ name, words: next });
  };
  const [to, setTo] = useState('');
  const places = directory.filter(
    (one) => one.kind === 'location' && one.entityId !== entity.entityId,
  );
  const target = to === '' ? (places[0]?.entityId ?? '') : to;
  const changed = name.trim() !== entity.name || words.trim() !== description.trim();
  return (
    <details className="disclosure change-by-hand">
      <summary>{t('Change by hand (DM)')}</summary>
      <div className="hand-form">
        {kind !== 'npc' && (
          <>
            <div className="account-field">
              <label htmlFor={`${ids}-name`}>{t('Name')}</label>
              <input
                id={`${ids}-name`}
                maxLength={120}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <div className="account-field">
              <label htmlFor={`${ids}-words`}>{t('What it is like')}</label>
              <textarea
                id={`${ids}-words`}
                rows={3}
                maxLength={4000}
                value={words}
                onChange={(event) => {
                  setWords(event.target.value);
                }}
              />
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={locked || !changed || name.trim() === ''}
                onClick={() => {
                  onRun({
                    type: 'UpdateEntityProfile',
                    entityId: entity.entityId,
                    name: name.trim(),
                    description: words.trim(),
                  });
                  setDraft(null);
                }}
              >
                {t('Save the name and words')}
              </button>
            </div>
          </>
        )}
        {movable && places.length > 0 && (
          <div className="hand-row change-move">
            <div className="account-field">
              <label htmlFor={`${ids}-to`}>{t('Move to')}</label>
              <select
                id={`${ids}-to`}
                value={target}
                onChange={(event) => {
                  setTo(event.target.value);
                }}
              >
                {places.map((one) => (
                  <option key={one.entityId} value={one.entityId}>
                    {one.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={locked || target === ''}
              onClick={() => {
                onRun({ type: 'PlaceEntity', entityId: entity.entityId, locationId: target });
              }}
            >
              {t('Move')}
            </button>
          </div>
        )}
        {movable && (
          <StatusChoice
            locked={locked}
            kind={kind}
            onChange={(status) => {
              onRun({ type: 'ChangeEntityStatus', entityId: entity.entityId, status });
            }}
          />
        )}
        {(kind === 'creature' || kind === 'npc') && (
          <Numbers
            api={api}
            entityId={entity.entityId}
            revision={revision}
            locked={locked}
            onRun={onRun}
          />
        )}
      </div>
    </details>
  );
}

function StatusChoice({
  locked,
  kind,
  onChange,
}: {
  readonly locked: boolean;
  readonly kind: EntityKind;
  readonly onChange: (status: EntityStatus) => void;
}) {
  const t = useT();
  const ids = useId();
  const [status, setStatus] = useState<EntityStatus>('destroyed');
  // A thing is never dead; a creature or a person may be.
  const shown = ENTITY_STATUSES.filter((one) => kind !== 'item' || one !== 'dead');
  return (
    <div className="hand-row change-status">
      <div className="account-field">
        <label htmlFor={`${ids}-status`}>{t('In the world')}</label>
        <select
          id={`${ids}-status`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EntityStatus);
          }}
        >
          {shown.map((one) => (
            <option key={one} value={one}>
              {t(STATUS_WORDS[one])}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          onChange(status);
        }}
      >
        {t('Set')}
      </button>
    </div>
  );
}

/** Armor Class, Hit Points and Speed of a stat block, set by hand (`SetStatBlock`). */
function Numbers({
  api,
  entityId,
  revision,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<StatBlockResponse>(
          `entities/${encodeURIComponent(entityId)}/stat-block`,
          signal,
          false,
        )
        .catch(() => null),
    [api, entityId],
  );
  const { resource, reread } = useResource(`stat-block:${entityId}`, load);
  useRereadOn(revision, reread);
  const block = resource.status === 'ready' ? resource.value?.statBlock : undefined;
  const [draft, setDraft] = useState<{ ac: number; hp: number; speed: number } | null>(null);
  if (!block) return null;
  const shown = draft ?? {
    ac: block.armorClass,
    hp: block.hitPoints.max,
    speed: block.speedFt,
  };
  const field = (key: 'ac' | 'hp' | 'speed', label: string, max: number, step = 1) => (
    <div className="account-field">
      <label htmlFor={`${ids}-${key}`}>{label}</label>
      <input
        id={`${ids}-${key}`}
        type="number"
        min={key === 'speed' ? 0 : 1}
        max={max}
        step={step}
        value={shown[key]}
        onChange={(event) => {
          const raw = Math.round(Number(event.target.value) / step) * step;
          setDraft({ ...shown, [key]: Math.min(max, Math.max(key === 'speed' ? 0 : 1, raw || 0)) });
        }}
      />
    </div>
  );
  return (
    <fieldset className="change-numbers">
      <legend>{t('Its numbers')}</legend>
      <div className="hand-row">
        {field('ac', t('Armor Class'), 40)}
        {field('hp', t('Hit Point maximum'), 999)}
        {field('speed', t('Speed, ft'), 200, 5)}
      </div>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={locked || draft === null}
          onClick={() => {
            const full = block.hitPoints.current === block.hitPoints.max;
            onRun({
              type: 'SetStatBlock',
              entityId,
              statBlock: {
                ...block,
                armorClass: shown.ac,
                speedFt: shown.speed,
                hitPoints: {
                  ...block.hitPoints,
                  max: shown.hp,
                  current: full ? shown.hp : Math.min(block.hitPoints.current, shown.hp),
                },
              },
            });
            setDraft(null);
          }}
        >
          {t('Save the numbers')}
        </button>
      </div>
    </fieldset>
  );
}
