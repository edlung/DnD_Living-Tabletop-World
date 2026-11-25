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

/** A drawn tile before the heroes: everyone at once, the DM alone. */
interface Lead {
  readonly value: string;
  readonly label: string;
  readonly pick: string;
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
  wordsOf,
  disabled = false,
  onChange,
}: {
  readonly legend: string;
  readonly name: string;
  /** The chosen hero's id, a lead's value, or '' while nothing is chosen. */
  readonly value: string;
  readonly heroes: readonly EntityRef[];
  /** Options before the heroes: everyone at once, the DM alone. */
  readonly first?: Lead | readonly Lead[];
  /** A hero's words under the face, where the choice says more than the name ("Finn and me"). */
  readonly wordsOf?: (hero: EntityRef) => string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const api = useRulesApi();
  const leads: readonly Lead[] = first === undefined ? [] : 'value' in first ? [first] : first;
  return (
    <fieldset className="pick-tiles hero-tiles">
      <legend>{legend}</legend>
      {leads.map((lead) => (
        <PickRadio
          key={lead.value}
          pick={lead.pick}
          name={name}
          value={lead.value}
          checked={value === lead.value}
          disabled={disabled}
          onChange={() => {
            onChange(lead.value);
          }}
        >
          {lead.label}
        </PickRadio>
      ))}
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
          <span className="pick-words">{wordsOf ? wordsOf(hero) : hero.name}</span>
        </label>
      ))}
    </fieldset>
  );
}
