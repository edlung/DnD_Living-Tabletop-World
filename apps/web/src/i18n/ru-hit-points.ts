import { registerRussian } from '@ltw/ui';

/**
 * Russian for the hit points' rules (Stage 640e, docs/adr/0048-hit-points.md): temporary hit points,
 * a lowered maximum, a target's defenses, knocking out and first aid.
 */
registerRussian({
  // Beside the hit points
  '+{amount} temporary': '+{amount} временных',
  'Maximum lowered by {amount}': 'Максимум снижен на {amount}',

  // The DM's hand
  'Temporary hit points': 'Временные хиты',
  'Give temporary hit points': 'Дать временные хиты',
  'Lower the maximum': 'Снизить максимум',
  '{name}: {amount} temporary hit points': '{name}: {amount} временных хитов',
  '{name}: maximum lowered by {amount}, hit points {before} → {after}':
    '{name}: максимум снижен на {amount}, хиты {before} → {after}',

  // Knocking out and first aid
  'Knock out instead of killing (melee)': 'Не убивать, а лишить сознания (ближний бой)',
  'It is knocked out.': 'Цель лишена сознания, но жива.',
  'First aid': 'Первая помощь',
  'First aid for {target}': 'Первая помощь: {target}',
  'needs no aid': 'помощь не нужна',
  'A DC 10 Medicine check: one dying becomes stable, one knocked out comes round.':
    'Проверка Медицины Сл 10: умирающий стабилизируется, лишённый сознания приходит в себя.',

  // What a target's defenses made of the damage
  'It resists the damage: half of it.': 'Сопротивление урону: только половина.',
  'It is vulnerable to the damage: double.': 'Уязвимость к урону: вдвое больше.',
  'It is immune to the damage.': 'Иммунитет к урону.',

  // Objects in a fight (docs/adr/0048-hit-points.md §5); 'Object' as the workshop says it
  Object: 'Объект',
  object: 'объект',
  'not a creature': 'это не существо',
  'An object is struck: no grapple or shove takes hold of it.':
    'Предмет можно только ударить: схватить или толкнуть его нельзя.',
  'A punch, or a blow with an object at hand.': 'Удар кулаком или подручным предметом.',
  'Something to break': 'Что-то сломать',
  // A creature from the SRD's bestiary (docs/adr/0053-monsters-as-data.md §3).
  'From the bestiary': 'Из бестиария',
  'Find by name or type': 'Найти по имени или виду',
  Creature: 'Существо',
  'Nothing matches.': 'Ничего не нашлось.',
  '{name} · CR {cr}': '{name} · ПО {cr}',
  '{size} {type} · AC {ac} · {hp} HP · {xp} XP': '{size} {type} · КД {ac} · {hp} ХП · {xp} опыта',
  Side: 'Сторона',
  'Add to the fight': 'Добавить в бой',
  '{name} joins the fight.': '{name} вступает в бой.',
  '{name} was added to the campaign.': '{name}: добавлено в кампанию.',
  'It could not be added. Try again.': 'Не удалось добавить. Попробуйте ещё раз.',
  'Someone already stands there. Choose another square.':
    'Там уже кто-то стоит. Выберите другую клетку.',
  'It does not fit there: its space would cross the edge of the battlefield or a wall.':
    'Здесь не поместится: его место заходит за край поля боя или в стену.',
  'The fight holds as many combatants as it can.':
    'В бою уже столько участников, сколько он вмещает.',
  // A creature's actions with a save (docs/adr/0053-monsters-as-data.md §2).
  '{name}: actions with a save': '{name}: действия со спасброском',
  'Aimed at': 'Цель',
  '{name}: {count} left today': '{name}: осталось сегодня {count}',
  '{name}: ready': '{name}: готово',
  '{name}: spent, back on a d6 of {recharge} or more':
    '{name}: потрачено, вернётся на d6 от {recharge}',
  '{name}: used up today': '{name}: на сегодня исчерпано',
  'use a creature’s action': 'применить действие существа',
  'not recharged': 'ещё не перезарядилось',
  'no uses left': 'использований не осталось',
  // Legendary actions and the fight's difficulty (docs/adr/0053-monsters-as-data.md §3–4).
  'Legendary actions': 'Легендарные действия',
  '{name}: {count} left this round': '{name}: в этом раунде осталось {count}',
  '{attack} (legendary)': '{attack} (легендарное)',
  'Legendary: {weapon}': 'Легендарное: {weapon}',
  Low: 'Низкая',
  Moderate: 'Средняя',
  High: 'Высокая',
  'Beyond High': 'Выше высокой',
  'Difficulty: {rating}. Foes {xp} XP; the party’s budget: Low {low}, Moderate {moderate}, High {high}.':
    'Сложность: {rating}. Противники — {xp} опыта; бюджет отряда: низкая {low}, средняя {moderate}, высокая {high}.',
  '{count} without XP in their stat block.': 'Без опыта в блоке характеристик: {count}.',
  'Its stat block': 'Его блок характеристик',
  'Reading its stat block…': 'Читаю блок характеристик…',
  Traits: 'Особенности',
  Actions: 'Действия',
  'Bonus actions': 'Бонусные действия',
  Reactions: 'Реакции',
  What: 'Что',
  'Made of': 'Из чего',
  Size: 'Размер',
  Build: 'Прочность',
  'Resilient: a door, a chest': 'Прочный: дверь, сундук',
  'Fragile: a bottle, a rope': 'Хрупкий: бутылка, верёвка',
  'Bring it into the fight': 'Добавить в бой',
  'bring an object into the fight': 'добавить объект в бой',
  'Cloth, paper or rope': 'Ткань, бумага или верёвка',
  'Crystal, glass or ice': 'Хрусталь, стекло или лёд',
  Wood: 'Дерево',
  Stone: 'Камень',
  'Iron or steel': 'Железо или сталь',
  Mithral: 'Мифрил',
  Adamantine: 'Адамантин',
  Tiny: 'Крошечный',
  Small: 'Маленький',
  Medium: 'Средний',
  Large: 'Большой',
  'Tiny: a bottle, a lock': 'Крошечный: бутылка, замок',
  'Small: a chest, a lute': 'Маленький: сундук, лютня',
  'Medium: a barrel, a chandelier': 'Средний: бочка, люстра',
  'Large: a cart, a dining table': 'Большой: телега, обеденный стол',
});
