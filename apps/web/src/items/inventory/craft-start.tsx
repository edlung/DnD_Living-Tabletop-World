import { MAX_CRAFT_QUANTITY, type CraftingResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { worthIn } from '../coin-words.ts';
import type { ItemCommandBody } from '../item-command.ts';

/**
 * Beginning a project (docs/adr/0057-encounters-maps-loot.md §9): what to make — a thing whose tool
 * the character carries and knows, by tool, or a Spell Scroll of a prepared spell — how many of a
 * thing that stacks, who of the party here helps (proficient with the tool, as many as the campaign
 * allows), then the materials and the days of work, before anything is paid.
 */
export function CraftStart({
  crafting,
  blocked,
  onRun,
}: {
  readonly crafting: CraftingResponse;
  readonly blocked: boolean;
  readonly onRun: (body: ItemCommandBody) => void;
}) {
  const t = useT();
  const ids = useId();
  const [choice, setChoice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [helperIds, setHelperIds] = useState<readonly string[]>([]);
  const { recipes, scrolls } = crafting;
  if (recipes.length === 0 && scrolls.length === 0)
    return (
      <p className="muted">
        {t(
          'You carry no tool you are proficient with, and have no spell prepared to scribe. A tool and its proficiency let you make what it makes.',
        )}
      </p>
    );
  const recipe = recipes.find((one) => `item:${one.catalogId}` === choice) ?? null;
  const scroll = scrolls.find((one) => `spell:${one.spellId}` === choice) ?? null;
  const count = recipe?.stackable ? quantity : 1;
  const able = recipe ? crafting.helpers.filter((one) => one.toolIds.includes(recipe.toolId)) : [];
  const helping = helperIds.filter((id) => able.some((one) => one.entity.entityId === id));
  const days = (recipe?.days ?? scroll?.days ?? 0) * count;
  const materialsCp = (recipe?.materialsCp ?? scroll?.costCp ?? 0) * count;
  const price = (cp: number) => worthIn(t, cp, crafting.coinage) || t('none');
  const short = materialsCp > crafting.purseCp;
  const tools = [...new Set(recipes.map((one) => one.toolName))];
  return (
    <details className="craft-start">
      <summary>{t('Begin a project')}</summary>
      <div className="craft-form">
        <div className="account-field">
          <label htmlFor={`${ids}-what`}>{t('What to make')}</label>
          <select
            id={`${ids}-what`}
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value);
              setQuantity(1);
              setHelperIds([]);
            }}
          >
            <option value="">{t('Choose…')}</option>
            {tools.map((tool) => (
              <optgroup key={tool} label={tool}>
                {recipes
                  .filter((one) => one.toolName === tool)
                  .map((one) => (
                    <option key={one.catalogId} value={`item:${one.catalogId}`}>
                      {one.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            {scrolls.length > 0 && (
              <optgroup label={t('Spell Scrolls')}>
                {scrolls.map((one) => (
                  <option key={one.spellId} value={`spell:${one.spellId}`}>
                    {one.level === 0
                      ? t('{spell} (cantrip)', { spell: one.name })
                      : t('{spell} (level {level})', { spell: one.name, level: one.level })}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {recipe?.stackable && (
          <div className="account-field">
            <label htmlFor={`${ids}-count`}>{t('How many')}</label>
            <input
              id={`${ids}-count`}
              type="number"
              min={1}
              max={MAX_CRAFT_QUANTITY}
              value={quantity}
              onChange={(event) => {
                const next = Math.round(Number(event.target.value));
                setQuantity(Math.min(MAX_CRAFT_QUANTITY, Math.max(1, next || 1)));
              }}
            />
          </div>
        )}
        {recipe && able.length > 0 && (
          <fieldset className="craft-helpers">
            <legend>
              {crafting.maxHelpers === 1
                ? t('Who helps (one may)')
                : t('Who helps (up to {count})', { count: crafting.maxHelpers })}
            </legend>
            {able.map((one) => {
              const on = helping.includes(one.entity.entityId);
              return (
                <label key={one.entity.entityId} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={one.busy || (!on && helping.length >= crafting.maxHelpers)}
                    onChange={() => {
                      setHelperIds(
                        on
                          ? helping.filter((id) => id !== one.entity.entityId)
                          : [...helping, one.entity.entityId],
                      );
                    }}
                  />
                  {one.busy
                    ? t('{name} (on a project)', { name: one.entity.name })
                    : one.entity.name}
                </label>
              );
            })}
          </fieldset>
        )}
        {(recipe ?? scroll) && (
          <div className="craft-sum" role="status">
            <span>{t('Materials: {worth}', { worth: price(materialsCp) })}</span>
            <span>
              {helping.length === 0
                ? t('Days of work: {days}', { days })
                : t('Days of work: {days}, shared by {count}: {each} each', {
                    days,
                    count: helping.length + 1,
                    each: Math.round((days / (helping.length + 1)) * 10) / 10,
                  })}
            </span>
            <span className="muted">
              {t('Your coins: {worth}', { worth: price(crafting.purseCp) })}
            </span>
            {short && <span className="craft-short">{t('Not enough coins')}</span>}
          </div>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={blocked || (recipe ?? scroll) === null || short}
          onClick={() => {
            onRun(
              recipe
                ? {
                    type: 'StartCrafting',
                    catalogId: recipe.catalogId,
                    quantity: count,
                    helperIds: [...helping],
                  }
                : {
                    type: 'StartCrafting',
                    spellId: scroll?.spellId ?? '',
                    quantity: 1,
                    helperIds: [],
                  },
            );
          }}
        >
          {t('Begin the work')}
        </button>
      </div>
    </details>
  );
}
