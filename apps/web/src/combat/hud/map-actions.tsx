import type { ContextAction } from '@ltw/contracts';
import { useT } from '@ltw/ui';

const ways = [
  ['attack', 'Attack options'],
  ['spell', 'Spell'],
  ['walk', 'Walk'],
  ['other', 'Other actions'],
] as const;
export type MapWay = (typeof ways)[number][0];

export const attackOptions: ReadonlySet<string> = new Set([
  'longbow_attack',
  'weapon_attack',
  'offhand_attack',
  'cleave_attack',
  'unarmed_strike',
  'form_attack',
]);
const spells: ReadonlySet<string> = new Set([
  'fireball',
  'healing_word',
  'hunters_mark',
  'counterspell',
  'cast_spell',
]);

/** Group the options actually listed for the target, retaining their indices and disabled reasons. */
export function wayFor(action: ContextAction): MapWay {
  if (action.spell || spells.has(action.id)) return 'spell';
  return attackOptions.has(action.id) ? 'attack' : 'other';
}

export function MapActions({ onChoose }: { readonly onChoose: (way: MapWay) => void }) {
  const t = useT();
  return (
    <div className="map-actions" role="group" aria-label={t('Choose an action')}>
      {ways.map(([way, label]) => (
        <button
          key={way}
          type="button"
          onClick={() => {
            onChoose(way);
          }}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

export const mapPrompts: Record<MapWay, string> = {
  attack: 'Choose whom to attack on the map.',
  spell: 'Choose a spell target on the map.',
  walk: 'Choose a square to walk to.',
  other: 'Choose a figure for other actions.',
};
