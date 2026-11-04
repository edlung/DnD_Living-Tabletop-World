import type { InventoryItem } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';

import { rarityName } from '../item-text.ts';

/**
 * A magic item on its card (docs/adr/0054-items-as-data.md §5): its rarity, attunement and the
 * curse the DM is told of, what its bonuses add, and the button that attunes or ends it.
 */
type Magic = NonNullable<NonNullable<InventoryItem['catalog']>['magic']>;

/** A magic item's rarity and attunement, and the curse the DM is told of (ADR 0054 §5). */
export function MagicLine({
  magic,
  attuned,
}: {
  readonly magic: Magic;
  readonly attuned: boolean;
}) {
  const t = useT();
  return (
    <p className="item-magic">
      {rarityName(t, magic.rarity)}
      {magic.attunement !== null && (
        <>
          {' · '}
          {attuned ? t('Attuned') : t('Needs attunement')}
          {!attuned && magic.attunement !== '' && <span lang="en"> ({magic.attunement})</span>}
        </>
      )}
      {magic.cursed && ` · ${t('Cursed')}`}
    </p>
  );
}

/**
 * Attune or end it: the player in a Short Rest, the DM any time; a cursed item's attunement only
 * the DM ends, lifting the curse.
 */
export function AttuneButton({
  attuned,
  cursed,
  attuning,
  onAttune,
}: {
  readonly attuned: boolean;
  readonly cursed: boolean;
  readonly attuning: 'rest' | 'dm';
  readonly onAttune: (attuned: boolean, liftCurse?: true) => void;
}) {
  const t = useT();
  if (attuned && cursed)
    return (
      <button
        type="button"
        onClick={() => {
          onAttune(false, true);
        }}
      >
        {t('Lift the curse')}
      </button>
    );
  return (
    <button
      type="button"
      onClick={() => {
        onAttune(!attuned);
      }}
    >
      {attuned
        ? t('End attunement')
        : attuning === 'rest'
          ? t('Attune in this short rest')
          : t('Attune')}
    </button>
  );
}

/** "+1 to attack and damage", "+1 to Armor Class and saves". */
export function bonusWords(t: Translate, bonus: NonNullable<Magic['bonus']>): string {
  const parts = [
    bonus.attack !== undefined ? t('+{bonus} to attack and damage', { bonus: bonus.attack }) : null,
    bonus.armorClass !== undefined
      ? t('+{bonus} to Armor Class', { bonus: bonus.armorClass })
      : null,
    bonus.saves !== undefined ? t('+{bonus} to saving throws', { bonus: bonus.saves }) : null,
  ];
  return parts.filter(Boolean).join(', ');
}
