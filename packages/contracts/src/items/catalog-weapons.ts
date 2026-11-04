import type { ItemEntry } from './schema.ts';

/**
 * Weapons and coins of the Ravenford setting (Stage 520): names and words are the project's own;
 * each weapon carries the SRD 5.2.1 weapon it fights as (`weapon`, the rules' `WEAPONS`).
 * Light weapons go in either hand; the rest in the main hand.
 */
const weapon = (
  itemId: string,
  rules: NonNullable<ItemEntry['weapon']>,
  name: ItemEntry['name'],
  description: ItemEntry['description'],
  weightLb: number,
  valueCp: number,
  light = false,
): ItemEntry => ({
  itemId,
  category: 'weapon',
  name,
  description,
  weightLb,
  valueCp,
  stackable: false,
  slots: light ? ['mainhand', 'offhand'] : ['mainhand'],
  weapon: rules,
});

export const WEAPON_ITEMS: readonly ItemEntry[] = [
  weapon(
    'hunting-knife',
    'dagger',
    { ru: 'Охотничий нож', en: 'Hunting knife' },
    {
      ru: 'Простой стальной нож с костяной рукоятью — и для дичи, и для драки.',
      en: 'A plain steel knife with a bone handle, for game and for a scuffle.',
    },
    1,
    200,
    true,
  ),
  weapon(
    'ranger-shortsword',
    'shortsword',
    { ru: 'Короткий клинок следопыта', en: "Ranger's short blade" },
    {
      ru: 'Прямой короткий меч с потёртой кожаной рукоятью, лёгкий и быстрый.',
      en: 'A straight short sword with a worn leather grip, light and quick.',
    },
    2,
    1000,
    true,
  ),
  weapon(
    'arming-sword',
    'longsword',
    { ru: 'Боевой меч', en: 'Arming sword' },
    {
      ru: 'Обоюдоострый одноручный меч с латунным навершием; можно взять двумя руками.',
      en: 'A double-edged one-handed sword with a brass pommel; it takes two hands too.',
    },
    3,
    1500,
  ),
  weapon(
    'duelist-rapier',
    'rapier',
    { ru: 'Рапира дуэлянта', en: "Duellist's rapier" },
    {
      ru: 'Тонкий клинок с витой гардой из воронёной стали и золотой проволоки.',
      en: 'A slender blade with a swept guard of blackened steel and gold wire.',
    },
    2,
    2500,
  ),
  weapon(
    'caravan-scimitar',
    'scimitar',
    { ru: 'Караванный ятаган', en: 'Caravan scimitar' },
    {
      ru: 'Изогнутый клинок обозных охранников с южных дорог.',
      en: 'A curved blade of the caravan guards from the southern roads.',
    },
    3,
    2500,
    true,
  ),
  weapon(
    'woodcutter-hatchet',
    'handaxe',
    { ru: 'Топорик лесоруба', en: "Woodcutter's hatchet" },
    {
      ru: 'Маленький топор на ясеневой рукояти; рубит и ветки, и щиты.',
      en: 'A small axe on an ash handle; it bites branches and shields alike.',
    },
    2,
    500,
    true,
  ),
  weapon(
    'guard-battleaxe',
    'battleaxe',
    { ru: 'Боевой топор стражи', en: "Guard's battleaxe" },
    {
      ru: 'Тяжёлая бородовидная секира на окованном дубовом древке.',
      en: 'A heavy bearded axe on an iron-bound oak haft.',
    },
    4,
    1000,
  ),
  weapon(
    'flanged-mace',
    'mace',
    { ru: 'Шестопёр', en: 'Flanged mace' },
    {
      ru: 'Железная булава с семью перьями — против кольчуги лучше меча.',
      en: 'An iron mace with seven flanges — better than a sword against mail.',
    },
    4,
    500,
  ),
  weapon(
    'smith-warhammer',
    'warhammer',
    { ru: 'Кузнечный боевой молот', en: "Smith's warhammer" },
    {
      ru: 'Молот с квадратным бойком и шипом на обухе, выкованный для боя.',
      en: 'A hammer with a square face and a back spike, forged for battle.',
    },
    2,
    1500,
  ),
  weapon(
    'ash-staff',
    'quarterstaff',
    { ru: 'Посох из ясеня', en: 'Ash-wood staff' },
    {
      ru: 'Длинный посох с железными наконечниками — опора в пути и оружие в беде.',
      en: 'A long staff with iron caps — a walking aid on the road, a weapon in trouble.',
    },
    4,
    20,
  ),
  weapon(
    'boar-spear',
    'spear',
    { ru: 'Рогатина', en: 'Boar spear' },
    {
      ru: 'Копьё с широким наконечником и перекладиной, чтобы зверь не дошёл до охотника.',
      en: 'A broad-headed spear with a crossbar, so the beast never reaches the hunter.',
    },
    3,
    100,
  ),
  weapon(
    'yew-longbow',
    'longbow',
    { ru: 'Тисовый длинный лук', en: 'Yew longbow' },
    {
      ru: 'Высокий лук из тиса с кожаной обмоткой рукояти; бьёт далеко и точно.',
      en: 'A tall yew bow with a leather-wrapped grip; it shoots far and true.',
    },
    2,
    5000,
  ),
  weapon(
    'hunting-shortbow',
    'shortbow',
    { ru: 'Охотничий короткий лук', en: 'Hunting shortbow' },
    {
      ru: 'Компактный изогнутый лук из тёмного дерева и рога.',
      en: 'A compact recurved bow of dark wood and horn.',
    },
    2,
    2500,
  ),
  weapon(
    'guard-crossbow',
    'light-crossbow',
    { ru: 'Арбалет стражи', en: "Guard's crossbow" },
    {
      ru: 'Лёгкий арбалет с деревянным ложем и стальной дугой.',
      en: 'A light crossbow with a wooden stock and a steel bow.',
    },
    5,
    2500,
  ),
];

const coin = (
  itemId: string,
  name: ItemEntry['name'],
  description: ItemEntry['description'],
  valueCp: number,
): ItemEntry => ({
  itemId,
  category: 'coins',
  name,
  description,
  // Fifty coins weigh a pound.
  weightLb: 0.02,
  valueCp,
  stackable: true,
  slots: [],
});

export const COIN_ITEMS: readonly ItemEntry[] = [
  coin(
    'gold-crown',
    { ru: 'Золотые кроны', en: 'Gold crowns' },
    {
      ru: 'Толстые золотые монеты с короной и оленем. Одна крона — десять марок.',
      en: 'Thick gold coins struck with a crown and a stag. A crown is ten marks.',
    },
    100,
  ),
  coin(
    'silver-mark',
    { ru: 'Серебряные марки', en: 'Silver marks' },
    {
      ru: 'Тонкие серебряные монеты с вороном Равенфорда. Одна марка — десять пенни.',
      en: 'Thin silver coins with the Ravenford raven. A mark is ten pennies.',
    },
    10,
  ),
  coin(
    'copper-penny',
    { ru: 'Медные пенни', en: 'Copper pennies' },
    {
      ru: 'Стёртые медные монетки с башней; на них держится рыночная торговля.',
      en: 'Worn copper coins with a tower; the market lives on them.',
    },
    1,
  ),
];

const ammunition = (
  itemId: string,
  kind: NonNullable<ItemEntry['ammunition']>,
  name: ItemEntry['name'],
  description: ItemEntry['description'],
  weightLb: number,
  valueCp: number,
): ItemEntry => ({
  itemId,
  category: 'gear',
  name,
  description,
  weightLb,
  valueCp,
  stackable: true,
  slots: [],
  ammunition: kind,
});

/**
 * Ammunition of the Ravenford setting (docs/adr/0047-weapons.md §5): a unit is one piece, spent by
 * a shot of the weapon that fires its kind, half of them found again after a fight.
 */
export const AMMUNITION_ITEMS: readonly ItemEntry[] = [
  ammunition(
    'goose-fletched-arrows',
    'arrow',
    { ru: 'Стрелы с гусиным оперением', en: 'Goose-fletched arrows' },
    {
      ru: 'Прямые ясеневые стрелы с серым оперением и гранёными наконечниками.',
      en: 'Straight ash arrows with grey fletching and faceted heads.',
    },
    0.05,
    5,
  ),
  ammunition(
    'iron-quarrels',
    'bolt',
    { ru: 'Железные болты', en: 'Iron quarrels' },
    {
      ru: 'Короткие арбалетные болты с кожаным оперением, тяжёлые и злые.',
      en: 'Short crossbow quarrels with leather vanes, heavy and mean.',
    },
    0.075,
    5,
  ),
  ammunition(
    'river-stones',
    'bullet',
    { ru: 'Речные камни', en: 'River stones' },
    {
      ru: 'Гладкие речные камни: каждый ровно ложится в ремень пращи.',
      en: 'Smooth river stones; each sits snug in a sling.',
    },
    0.075,
    1,
  ),
  ammunition(
    'reed-darts',
    'needle',
    { ru: 'Тростниковые иглы', en: 'Reed needles' },
    {
      ru: 'Тонкие иглы с пушком на хвосте, для духовой трубки.',
      en: 'Thin needles with a tuft of down, for a blowgun.',
    },
    0.02,
    2,
  ),
];
