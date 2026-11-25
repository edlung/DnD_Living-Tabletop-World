import type { EntityRef } from '@ltw/contracts';

import type { WorldApi } from '../api/client.ts';
import { useRulesApi } from '../rules/reference-data.ts';
import { Medallion } from '../visual/medallion.tsx';
import { usePortrait } from '../world/use-portrait.ts';
import { PickRadio } from './pick.tsx';

function Face({ api, hero }: { readonly api: WorldApi; readonly hero: EntityRef }) {
  const image = usePortrait(api, hero.entityId);
  return <Medallion image={image} kind={hero.kind} size="sm" tone="party" />;
}

/**
 * Whom a form is about, as faces (docs/adr/0075-book-interface.md §25): each hero a tile with the
 * approved portrait (or the silhouette) over the name, in place of a list of names. An option may
 * stand before them — everyone at the table, the whole party — as a drawn tile. A group of radio
 * buttons under its legend, as every drawn choice is.
 */
export function HeroTiles({
  legend,
  name,
  value,
  heroes,
  first,
  disabled = false,
  onChange,
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: string;
  readonly heroes: readonly EntityRef[];
  /** An option before the heroes: everyone at once. */
  readonly first?: { readonly value: string; readonly label: string; readonly pick: string };
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const api = useRulesApi();
  return (
    <fieldset className="pick-tiles hero-tiles">
      <legend>{legend}</legend>
      {first && (
        <PickRadio
          pick={first.pick}
          name={name}
          value={first.value}
          checked={value === first.value}
          disabled={disabled}
          onChange={() => {
            onChange(first.value);
          }}
        >
          {first.label}
        </PickRadio>
      )}
      {heroes.map((hero) => (
        <label key={hero.entityId} className="pick-tile pick-face" data-pick="">
          <input
            type="radio"
            name={name}
            checked={value === hero.entityId}
            disabled={disabled}
            onChange={() => {
              onChange(hero.entityId);
            }}
          />
          {api ? (
            <Face api={api} hero={hero} />
          ) : (
            <Medallion image={null} kind={hero.kind} size="sm" tone="party" />
          )}
          <span className="pick-words">{hero.name}</span>
        </label>
      ))}
    </fieldset>
  );
}
