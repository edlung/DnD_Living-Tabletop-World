import { registerRussian } from '@ltw/ui';

/**
 * Russian for the weapons' rules (Stage 640d, docs/adr/0047-weapons.md): the rest of the SRD's
 * weapons, the masteries and what each does, the extra attacks and a mastery's choice.
 */
registerRussian({
  // The SRD weapons beside Ravenford's first fourteen
  Club: 'Дубинка',
  Greatclub: 'Палица',
  Javelin: 'Метательное копьё',
  'Light Hammer': 'Лёгкий молот',
  Sickle: 'Серп',
  Dart: 'Дротик',
  Sling: 'Праща',
  Flail: 'Цеп',
  Glaive: 'Глефа',
  Greataxe: 'Секира',
  Greatsword: 'Двуручный меч',
  Halberd: 'Алебарда',
  Lance: 'Длинное копьё',
  Maul: 'Молот',
  Morningstar: 'Моргенштерн',
  Pike: 'Пика',
  Trident: 'Трезубец',
  'War Pick': 'Боевая кирка',
  Whip: 'Кнут',
  Blowgun: 'Духовая трубка',
  'Hand Crossbow': 'Ручной арбалет',
  'Heavy Crossbow': 'Тяжёлый арбалет',
  Musket: 'Мушкет',
  Pistol: 'Пистолет',
  Reach: 'Досягаемость',

  // The masteries and what each does
  Cleave: 'Рассечение',
  Graze: 'Задевание',
  Nick: 'Подрез',
  Push: 'Толчок',
  Sap: 'Ослабление',
  Slow: 'Замедление',
  Topple: 'Опрокидывание',
  Vex: 'Досада',
  'Cleave: after a hit, one more attack at a creature beside it, without your modifier to damage. Once a turn.':
    'Рассечение: после попадания — ещё одна атака по существу рядом с целью, без модификатора к урону. Раз в ход.',
  'Graze: a miss still deals your ability modifier as damage.':
    'Задевание: даже промах наносит урон, равный модификатору характеристики.',
  'Nick: the other hand’s attack comes with the Attack action, not a Bonus Action. Once a turn.':
    'Подрез: атака второй рукой входит в действие «Атака», а не в бонусное действие. Раз в ход.',
  'Push: a hit pushes a creature up to 10 ft straight away from you.':
    'Толчок: попадание отталкивает существо до 10 футов прямо от вас.',
  'Sap: a creature you hit has Disadvantage on its next attack before your next turn.':
    'Ослабление: у существа, по которому вы попали, помеха на следующую атаку до вашего хода.',
  'Slow: a hit that deals damage lowers its Speed by 10 ft until your next turn.':
    'Замедление: попадание с уроном снижает его скорость на 10 футов до вашего хода.',
  'Topple: a hit may knock it Prone unless it succeeds on a Constitution save.':
    'Опрокидывание: попадание сбивает его с ног, если он провалит спасбросок Телосложения.',
  'Vex: a hit that deals damage gives you Advantage on your next attack against it.':
    'Досада: попадание с уроном даёт вам преимущество на следующую атаку по нему.',

  // The extra attacks and a mastery's choice before the attack
  'Other hand: {weapon}': 'Второй рукой: {weapon}',
  'Other hand: {weapon} at {target}': 'Второй рукой: {weapon} — {target}',
  'Cleave: {weapon}': 'Рассечение: {weapon}',
  'Cleave: {weapon} at {target}': 'Рассечение: {weapon} — {target}',
  'On a hit': 'При попадании',
  'Push 10 ft': 'Оттолкнуть на 10 фт',
  'Push 5 ft': 'Оттолкнуть на 5 фт',
  'Do not push': 'Не толкать',
  'Try to topple': 'Попробовать опрокинуть',
  'Do not topple': 'Не опрокидывать',

  // What the rules say of an attack before it is made
  'with disadvantage': 'с помехой',
  'with advantage': 'с преимуществом',
  disadvantage: 'помеха',
  advantage: 'преимущество',
  'no ammunition': 'нет боеприпасов',
  'hands full': 'руки заняты: щит',
  loading: 'перезарядка: этим действием уже стреляли',
  'no extra attack': 'нет дополнительной атаки',
  'Arrows: {count}': 'Стрелы: {count}',
  'Bolts: {count}': 'Болты: {count}',
  'Sling bullets: {count}': 'Снаряды для пращи: {count}',
  'Firearm bullets: {count}': 'Пули для огнестрельного оружия: {count}',
  'Needles: {count}': 'Иглы: {count}',
  'Attacked {target} with the other hand': 'Атаковал второй рукой: {target}',
  'Cleaved through to {target}': 'Рассёк и достал: {target}',

  // Without a weapon: a punch, a grapple, a shove, an object at hand (ADR 0047 §3, §6)
  'Without a weapon': 'Без оружия',
  'A grapple or a shove: it resists with Strength or Dexterity against your DC.':
    'Захват или толчок: цель сопротивляется Силой или Ловкостью против вашей Сл.',
  'Punch: 1 + Strength': 'Удар: 1 + Сила',
  Grapple: 'Захват',
  'Shove 5 ft away': 'Оттолкнуть на 5 фт',
  'Shove it Prone': 'Сбить с ног',
  'Strike with an object at hand': 'Ударить подручным предметом',
  Improvised: 'Подручный предмет',
  'Unarmed Strike at {target}': 'Безоружный удар: {target}',
  'A punch, a grapple or a shove, or a blow with an object at hand: you choose before it lands.':
    'Удар, захват или толчок — или удар подручным предметом: вы выбираете до удара.',
  'Escape a grapple': 'Вырваться из захвата',
  'Let go': 'Отпустить',
  'Athletics or Acrobatics against the grapple’s DC: on a success you are free.':
    'Атлетика или Акробатика против Сл захвата: при успехе вы свободны.',
  'Let go of the creature you hold. It takes no action.':
    'Отпустить существо, которое вы держите. Это не тратит действие.',
  'Grapple: it slips your grasp.': 'Захват: цель вывернулась.',
  'Shove: it stands its ground.': 'Толчок: цель устояла.',
  'Grapple: it is Grappled.': 'Захват: цель схвачена.',
  'Shove: it falls Prone.': 'Толчок: цель сбита с ног.',
  'Shove: it is pushed 5 ft.': 'Толчок: цель отброшена на 5 фт.',
  'already grappled': 'уже в вашем захвате',
  'not grappled': 'вас никто не держит',
  'not grappling': 'вы никого не держите',
  'Tried to grapple {target}': 'Пытался схватить: {target}',
  'Tried to shove {target}': 'Пытался толкнуть: {target}',

  // What a mastery did, after an attack's words
  'Sap: its next attack has Disadvantage.': 'Ослабление: у него помеха на следующую атаку.',
  'Vex: your next attack against it has Advantage.':
    'Досада: у вас преимущество на следующую атаку по нему.',
  'Push: it is pushed {feet} ft.': 'Толчок: его отбросило на {feet} фт.',
  'Topple: it falls Prone.': 'Опрокидывание: он сбит с ног.',
  'Topple: it keeps its feet.': 'Опрокидывание: он устоял на ногах.',
  'Graze: {damage} damage.': 'Задевание: {damage} урона.',
});
