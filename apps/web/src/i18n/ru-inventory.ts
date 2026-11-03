import { registerRussian } from '@ltw/ui';

/**
 * Russian for the inventory and weapons (Stage 520): the purse and load, the paper doll, the bag,
 * the item card, the rules weapons' names and properties, weapon attacks.
 */
registerRussian({
  // Purse and load
  Purse: 'Кошель',
  Crowns: 'Кроны',
  Marks: 'Марки',
  Pennies: 'Пенни',
  '{count} cr': '{count} кр.',
  '{count} m': '{count} м.',
  '{count} p': '{count} п.',
  Load: 'Нагрузка',
  '{weight} of {capacity} lb': '{weight} из {capacity} фнт.',
  'More than your Strength carries comfortably.': 'Больше, чем вам позволяет нести Сила.',

  // Doll, bag, card
  'Worn and wielded': 'Надето и в руках',
  '{slot}: {item}': '{slot}: {item}',
  '{slot}: empty': '{slot}: пусто',
  Show: 'Показать',
  Everything: 'Всё',
  Coins: 'Монеты',
  'Nothing else in the bag.': 'Больше в сумке ничего нет.',
  '{item}, {count}': '{item}, {count}',
  'Choose an item to see what it is and what you can do with it.':
    'Выберите предмет, чтобы увидеть, что это и что с ним можно сделать.',
  'Worn: {slot}': 'Надето: {slot}',
  'Reach {feet} ft': 'Досягаемость {feet} фт.',
  Properties: 'Свойства',
  '{base} + Dexterity': '{base} + Ловкость',
  '{base} + Dexterity (up to {cap})': '{base} + Ловкость (не больше {cap})',
  '+{bonus} while held': '+{bonus}, пока в руке',
  Worth: 'Стоимость',
  Wield: 'Взять в руку',
  'How many': 'Сколько',
  'of {total}': 'из {total}',
  '{slot} holds {item}.': '{slot}: сейчас там {item}.',
  'Take off {item}': 'Снять: {item}',

  // Weapon attacks
  'Attack {target} with {weapon}': 'Атаковать: {target} — {weapon}',
  'Attack with {weapon}': 'Атаковать: {weapon}',
  'a weapon': 'оружие',

  // The rules weapons and their properties
  Shortbow: 'Короткий лук',
  'Light Crossbow': 'Лёгкий арбалет',
  Dagger: 'Кинжал',
  Shortsword: 'Короткий меч',
  Longsword: 'Длинный меч',
  Rapier: 'Рапира',
  Scimitar: 'Скимитар',
  Handaxe: 'Ручной топор',
  Battleaxe: 'Боевой топор',
  Mace: 'Булава',
  Warhammer: 'Боевой молот',
  Quarterstaff: 'Боевой посох',
  Spear: 'Копьё',
  Finesse: 'Фехтовальное',
  Light: 'Лёгкое',
  Heavy: 'Тяжёлое',
  'Two Handed': 'Двуручное',
  Versatile: 'Универсальное',
  Thrown: 'Метательное',
  Loading: 'Перезарядка',
  Ammunition: 'Боеприпасы',
  // An enforced load (docs/adr/0056-characters-from-the-srd.md §3)
  'More than you can drag: you cannot move until you drop something.':
    'Больше, чем вы можете тащить: вы не сдвинетесь, пока не бросите что-нибудь.',
  'More than you can carry: you drag it, at a Speed of 5 ft.':
    'Больше, чем вы можете нести: вы тащите груз со Скоростью 5 фт.',
  // Loot, treasure and the party's stash (Stage 670e)
  'Put in the stash': 'Положить в общий тайник',
  'The party’s stash': 'Общий тайник отряда',
  'Nothing in the stash yet: put things in from their card.':
    'В тайнике пока пусто: положите вещь из её карточки.',
  'Take {item} from the stash': 'Взять {item} из тайника',
  'Leave treasure here': 'Оставить клад здесь',
  'Left here: {item}.': 'Оставлено здесь: {item}.',
  'Leave it here': 'Оставить здесь',
  'It carries nothing.': 'При нём ничего нет.',
  'It carries: {items}.': 'При нём: {items}.',
  'If it falls, what it carries lies here once the fight is over.':
    'Если существо падёт, его вещи останутся здесь после боя.',
});
