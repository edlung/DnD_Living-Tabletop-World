import type {
  CharacterChoices,
  ChoiceProblem,
  EquipSlot,
  SrdBackground,
  SrdClass,
  SrdPickKind,
  SrdStartingOption,
  WeaponId,
} from '@ltw/contracts';
import { srdItemEntry } from '@ltw/contracts/srd-items';

/**
 * A new character's starting equipment (SRD 5.2.1, Character Creation step 4; docs/adr/0056-
 * characters-from-the-srd.md §2): the class's option and the background's, the picks they ask (an
 * instrument, a holy symbol, a gaming set) and their gold as crowns, in stacks of at most 99. Body
 * armor and a shield are worn; the weapons go on the sheet; what does not stack comes one at a time.
 */
export interface StartingItem {
  readonly catalogId: string;
  readonly quantity: number;
  readonly wear?: Extract<EquipSlot, 'body' | 'offhand'>;
}

const GOLD = 'gold-crown';
const PICK_WORDS: Readonly<Record<SrdPickKind, string>> = {
  'musical-instrument': 'Pick a musical instrument',
  'holy-symbol': 'Pick a holy symbol',
  'gaming-set': 'Pick a gaming set',
  'artisans-tools': 'Pick artisan’s tools',
  'artisans-tools-or-musical-instrument': 'Pick artisan’s tools or a musical instrument',
};
const STACK = 99;

export interface StartingEquipment {
  readonly items: readonly StartingItem[];
  readonly weapons: readonly WeaponId[];
}

export function startingEquipment(
  cls: SrdClass,
  background: SrdBackground,
  choices: CharacterChoices['equipment'],
  problems: ChoiceProblem[],
): StartingEquipment {
  const option = (options: readonly SrdStartingOption[], label: string, field: string) => {
    const found = options.find((one) => one.label === label);
    if (!found) problems.push({ field, message: 'No option {label}', params: { label } });
    return found;
  };
  const chosen = [
    option(cls.creation.equipment, choices.classOption, 'equipment.classOption'),
    option(background.creation.equipment, choices.backgroundOption, 'equipment.backgroundOption'),
  ].filter((one): one is SrdStartingOption => one !== undefined);
  const picks = [...choices.picks];
  const items: StartingItem[] = [];
  let gold = 0;
  for (const one of chosen) {
    items.push(...one.items);
    gold += one.gp;
    for (const pick of one.picks) {
      const picked = picks.shift();
      if (picked === undefined || !pick.from.includes(picked))
        problems.push({ field: 'equipment.picks', message: PICK_WORDS[pick.kind] });
      else items.push({ catalogId: picked, quantity: 1 });
    }
  }
  if (picks.length > 0) problems.push({ field: 'equipment.picks', message: 'Too many picks' });
  let body = false;
  let shield = false;
  // A thing that does not stack comes one at a time ("8 Javelins": eight javelins).
  const single = items.flatMap((item) =>
    srdItemEntry(item.catalogId)?.stackable === false && item.quantity > 1
      ? Array.from({ length: item.quantity }, () => ({ ...item, quantity: 1 }))
      : [item],
  );
  const worn = single.map((item): StartingItem => {
    const entry = srdItemEntry(item.catalogId);
    if (entry?.armor && !body) {
      body = true;
      return { ...item, wear: 'body' };
    }
    if (entry?.shieldBonus !== undefined && !shield) {
      shield = true;
      return { ...item, wear: 'offhand' };
    }
    return item;
  });
  for (let left = gold; left > 0; left -= STACK)
    worn.push({ catalogId: GOLD, quantity: Math.min(STACK, left) });
  const weapons = [
    ...new Set(
      items.flatMap((item) => {
        const weapon = srdItemEntry(item.catalogId)?.weapon;
        return weapon ? [weapon] : [];
      }),
    ),
  ];
  return { items: worn, weapons };
}
