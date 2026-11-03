import { opaque } from './foes.ts';
import { LEDGER } from './lore.ts';
import { t, type Text } from './text.ts';
import { BELL_CHAMBER, LANTERN_MAN } from './world.ts';

/**
 * The things of The Bells of Hollowmere (ADR 0039): Agna Brisk's wagon and Kerra Reed's ledger,
 * story objects lying where they are; and what people carry or a place holds from the SRD's
 * catalog — Sister Ilse's holy water to give, the smugglers' potions and silver, the lantern-
 * bearer's lantern and cloak, Saint Odran's mace in the chamber of the sunken bell. Items start
 * carried, never worn.
 */
export interface StoryObject {
  readonly id: string;
  readonly at: string;
  readonly name: Text;
  readonly description: Text;
}

export const STORY_OBJECTS: readonly StoryObject[] = [
  {
    id: 'brisk-cargo',
    at: 'north-gate',
    name: t('Wagon of Lamp-Oil and Salt', 'Повозка с маслом и солью'),
    description: t(
      'A covered wagon of oil jars packed in straw and sacks of grey salt, with a patient mule in the shafts.',
      'Крытая повозка: кувшины с маслом в соломе и мешки серой соли; в оглоблях терпеливый мул.',
    ),
  },
  {
    id: LEDGER,
    at: 'sunken-mill',
    name: t('Tarred Ledger', 'Просмолённая книга счетов'),
    description: t(
      'A ledger in a tarred cover, kept dry in an oilcloth; its last pages are in a hurried hand.',
      'Книга счетов в просмолённой обложке, завёрнутая в промасленную ткань; последние страницы исписаны торопливой рукой.',
    ),
  },
];

export interface Loot {
  readonly id: string;
  /** Who carries it, or the place it lies in. */
  readonly holder: string;
  readonly catalog: string;
  /** What a magic item is made on: a +1 weapon's weapon. */
  readonly base?: string;
  readonly quantity: number;
  readonly name: Text;
  readonly description: Text;
}

export const LOOT: readonly Loot[] = [
  {
    id: opaque('item', 'ilse-holy-water'),
    holder: 'sister-ilse',
    catalog: 'srd-holy-water',
    quantity: 3,
    name: t('Flask of Holy Water', 'Фляга святой воды'),
    description: t(
      'Water blessed at Saint Odran’s shrine, stoppered with wax stamped with a bell.',
      'Вода, освящённая у святыни утонувшего святого; пробка залита воском с оттиском колокола.',
    ),
  },
  {
    id: opaque('item', 'kerra-potions'),
    holder: 'kerra-reed',
    catalog: 'srd-potion-of-healing',
    quantity: 2,
    name: t('Potion of Healing', 'Зелье лечения'),
    description: t(
      'A red draught that glimmers when shaken.',
      'Красное снадобье, мерцающее, если его встряхнуть.',
    ),
  },
  {
    id: opaque('item', 'kerra-silver'),
    holder: 'kerra-reed',
    catalog: 'srd-silver-piece',
    quantity: 40,
    name: t('Silver Pieces', 'Серебряные монеты'),
    description: t(
      'Silver paid for the Reed Cloaks’ night work.',
      'Серебро, уплаченное Тростниковым плащам за ночную работу.',
    ),
  },
  {
    id: opaque('item', 'corvin-lantern'),
    holder: LANTERN_MAN,
    catalog: 'srd-lantern-of-revealing',
    quantity: 1,
    name: t('Lantern of Revealing', 'Фонарь откровения'),
    description: t(
      'A hooded lantern of black iron whose steady flame shows what hides unseen.',
      'Фонарь с колпаком из чёрного железа; ровное пламя показывает то, что скрыто от глаз.',
    ),
  },
  {
    id: opaque('item', 'corvin-cloak'),
    holder: LANTERN_MAN,
    catalog: 'srd-cloak-of-protection',
    quantity: 1,
    name: t('Grey Cloak', 'Серый плащ'),
    description: t(
      'A grey cloak, its hem stitched with a ring of ash-coloured thread.',
      'Серый плащ; подол прошит кольцом нити цвета пепла.',
    ),
  },
  {
    id: opaque('item', 'odran-mace'),
    holder: BELL_CHAMBER,
    catalog: 'srd-weapon-plus-1',
    base: 'srd-mace',
    quantity: 1,
    name: t('Saint Odran’s Mace', 'Одранова булава'),
    description: t(
      'A knight’s mace with a head shaped like a closed bell, untarnished after thirty years in water.',
      'Рыцарская булава с навершием в форме закрытого колокола; за тридцать лет в воде она не потускнела.',
    ),
  },
  {
    id: opaque('item', 'chamber-potion'),
    holder: BELL_CHAMBER,
    catalog: 'srd-potion-of-healing-greater',
    quantity: 1,
    name: t('Potion of Greater Healing', 'Зелье большого лечения'),
    description: t(
      'A deep red draught in a stoppered vial of old glass.',
      'Тёмно-красное снадобье в закупоренном флаконе старого стекла.',
    ),
  },
];
