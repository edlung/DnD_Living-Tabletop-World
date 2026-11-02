import { registerRussian } from '@ltw/ui';

/**
 * Russian for the character dialog (Stage 500, docs/adr/0031-play-language.md §10): the card, the
 * tabs, abilities, the 18 skills, spellcasting and the spells' own words.
 */
registerRussian({
  // Dock, dialog and tabs
  'Character: {name}': 'Персонаж: {name}',
  'Close the character sheet': 'Закрыть лист персонажа',
  Overview: 'Обзор',
  Skills: 'Навыки',
  Inventory: 'Снаряжение',

  // The card
  'Level {level}': 'Уровень {level}',
  of: 'из',
  Proficiency: 'Мастерство',
  'Concentrating: {spell}': 'Концентрация: {spell}',
  Hunter: 'Охотник',
  Evoker: 'Воплотитель',
  Champion: 'Чемпион',
  Thief: 'Вор',
  'Life Domain': 'Домен жизни',

  // Abilities and saves
  'Abilities and saving throws': 'Характеристики и спасброски',
  STR: 'СИЛ',
  DEX: 'ЛОВ',
  CON: 'ТЕЛ',
  INT: 'ИНТ',
  WIS: 'МДР',
  CHA: 'ХАР',
  'Save {bonus}': 'Спасбросок {bonus}',
  '{ability} {score}, modifier {modifier}, saving throw {save}':
    '{ability} {score}, модификатор {modifier}, спасбросок {save}',
  proficient: 'владение',
  'not proficient': 'без владения',
  expertise: 'компетентность',

  // Attacks and features
  'Attacks and features': 'Атаки и умения',
  'No weapon attacks are recorded.': 'Атаки оружием не записаны.',
  'To hit': 'Попадание',
  Damage: 'Урон',
  Range: 'Дальность',
  '{normal}/{long} ft': '{normal}/{long} фт.',
  Piercing: 'Колющий',
  Slashing: 'Рубящий',
  Bludgeoning: 'Дробящий',
  Fire: 'Огонь',
  Force: 'Силовое поле',
  'Fighting style: {style}': 'Боевой стиль: {style}',
  Archery: 'Стрельба',
  '+2 to ranged weapon attacks': '+2 к броскам атаки дальнобойным оружием',
  'Extra Attack: {count} attacks with the Attack action':
    'Дополнительная атака: {count} атаки действием «Атака»',
  '{spell} without a slot: {left} of {total} until a long rest':
    '{spell} без ячейки: {left} из {total} до долгого отдыха',
  Successes: 'Успехи',
  Failures: 'Провалы',

  // Skills
  'Passive scores': 'Пассивные значения',
  'Passive Perception': 'Пассивная внимательность',
  'Passive Investigation': 'Пассивный анализ',
  'Passive Insight': 'Пассивная проницательность',
  'A filled mark is proficiency, a double mark expertise; the number is your bonus to the roll.':
    'Закрашенная метка — владение, двойная — компетентность; число — ваш бонус к броску.',
  Athletics: 'Атлетика',
  Acrobatics: 'Акробатика',
  'Sleight of Hand': 'Ловкость рук',
  Nature: 'Природа',
  Religion: 'Религия',
  'Animal Handling': 'Уход за животными',
  Medicine: 'Медицина',
  Deception: 'Обман',
  Intimidation: 'Запугивание',
  Performance: 'Выступление',
  Persuasion: 'Убеждение',

  // Spells
  Spellcasting: 'Использование заклинаний',
  'This character casts no spells.': 'Этот персонаж не творит заклинаний.',
  'Save DC {dc}': 'Сл спасброска {dc}',
  'Spell attack {bonus}': 'Атака заклинанием {bonus}',
  'Slot level {level}': 'Круг {level}',
  '{left} of {total} left': 'осталось {left} из {total}',
  Cantrip: 'Заговор',
  'Level {level} spell': 'Заклинание {level}-го круга',
  Action: 'Действие',
  'Bonus action': 'Бонусное действие',
  Self: 'На себя',
  'You mark a creature you can see. Your weapon hits deal it an extra 1d6 Force damage while you concentrate.':
    'Вы помечаете видимое существо. Пока вы концентрируетесь, ваши попадания оружием наносят ему дополнительно 1d6 урона силовым полем.',
  'While you concentrate you sense magic within 30 feet and see a faint aura around enchanted things.':
    'Пока вы концентрируетесь, вы чувствуете магию в пределах 30 футов и видите слабую ауру вокруг зачарованных вещей.',
  'A creature you can see within 60 feet regains 2d4 hit points plus your spellcasting modifier; more with a higher slot.':
    'Видимое существо в пределах 60 футов восстанавливает 2d4 очков здоровья плюс ваш модификатор заклинательной характеристики; больше — с ячейкой выше.',
  'Wrapped in silver mist, you teleport up to 30 feet to a space you can see.':
    'Окутанные серебристым туманом, вы телепортируетесь на расстояние до 30 футов в видимое место.',
  'A bead of flame bursts in a 20-foot radius: everyone there makes a Dexterity save, taking 8d6 Fire damage, half on a success.':
    'Огненная искра взрывается в радиусе 20 футов: каждый там совершает спасбросок Ловкости и получает 8d6 урона огнём, вдвое меньше при успехе.',
  'As a reaction when an attack would hit you, a ward gives you +5 Armor Class until the start of your next turn, against that attack too.':
    'Реакцией, когда атака должна попасть по вам, щит даёт +5 к Классу Доспеха до начала вашего следующего хода — и против этой атаки.',
  'As a reaction when a creature you can see within 60 feet damages you, it takes 2d10 Fire damage, half on a Dexterity save; more with a higher slot.':
    'Реакцией, когда видимое вами существо в пределах 60 футов наносит вам урон, оно получает 2к10 урона огнём, половину при успешном спасброске Ловкости; больше с ячейкой выше.',
  'As a reaction when you or a creature you can see within 60 feet falls, up to five falling creatures there drift down and land on their feet, taking no damage from the fall.':
    'Реакцией, когда вы или видимое вами существо в пределах 60 футов падает: до пяти падающих там существ плавно опускаются и приземляются на ноги, не получая урона от падения.',
  'As a reaction you interrupt a creature casting a spell within 60 feet: it makes a Constitution save or the spell fails.':
    'Реакцией вы прерываете существо, творящее заклинание в пределах 60 футов: оно совершает спасбросок Телосложения, иначе заклинание не срабатывает.',
});
