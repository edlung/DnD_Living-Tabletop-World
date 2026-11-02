import { registerRussian } from '@ltw/ui';

/**
 * Russian for the conditions and Exhaustion (docs/adr/0045-conditions-and-actions.md), in the
 * terms of the Russian 5e: a condition's name, what it does, how it ends, the DM's form.
 */
registerRussian({
  Blinded: 'Ослеплён',
  // The board's squares name their occupants' conditions in lower case.
  blinded: 'ослеплён',
  charmed: 'очарован',
  deafened: 'оглох',
  frightened: 'испуган',
  grappled: 'схвачен',
  invisible: 'невидим',
  paralyzed: 'парализован',
  petrified: 'окаменел',
  poisoned: 'отравлен',
  restrained: 'опутан',
  stunned: 'ошеломлён',
  Charmed: 'Очарован',
  Deafened: 'Оглох',
  Frightened: 'Испуган',
  Grappled: 'Схвачен',
  Invisible: 'Невидим',
  Paralyzed: 'Парализован',
  Petrified: 'Окаменел',
  Poisoned: 'Отравлен',
  Restrained: 'Опутан',
  Stunned: 'Ошеломлён',
  Exhaustion: 'Истощение',
  'Exhaustion {level}': 'Истощение {level}',
  'Exhaustion (now {level})': 'Истощение (сейчас {level})',
  'Exhaustion level': 'Уровень истощения',
  'No exhaustion': 'Без истощения',
  '{level}: death': '{level}: смерть',
  'Exhaustion {level}: {penalty} to every d20 roll, Speed {feet} ft less.':
    'Истощение {level}: {penalty} к каждому броску d20, скорость меньше на {feet} фт.',
  'Its attacks have Disadvantage; attacks against it have Advantage.':
    'Его атаки — с помехой; атаки по нему — с преимуществом.',
  'It cannot attack its charmer or aim a spell at them.':
    'Не может атаковать очаровавшего или направить на него заклинание.',
  'It hears nothing: a check that needs hearing fails.':
    'Ничего не слышит: проверка, которой нужен слух, проваливается.',
  'Disadvantage on its checks and attacks while its fear is in sight; it cannot move closer.':
    'Помеха на проверки и атаки, пока источник страха рядом; не может к нему приблизиться.',
  'Speed 0; Disadvantage on attacks against anyone but its grappler.':
    'Скорость 0; помеха на атаки по всем, кроме схватившего.',
  'No action, bonus action or reaction; Concentration ends.':
    'Ни действий, ни бонусных действий, ни реакций; концентрация прерывается.',
  'Its attacks have Advantage; attacks against it have Disadvantage.':
    'Его атаки — с преимуществом; атаки по нему — с помехой.',
  'It cannot act or move and fails Strength and Dexterity saves; a hit from 5 ft is critical.':
    'Не может действовать и двигаться, проваливает спасброски Силы и Ловкости; попадание с 5 фт — критическое.',
  'Turned to stone: it cannot act or move, and resists all damage.':
    'Обращён в камень: не может действовать и двигаться, сопротивление всему урону.',
  'Disadvantage on its attacks and ability checks.': 'Помеха на атаки и проверки характеристик.',
  'Its attacks have Disadvantage; standing up costs half its Speed.':
    'Его атаки — с помехой; встать стоит половину скорости.',
  'Speed 0; its attacks and Dexterity saves have Disadvantage; attacks against it have Advantage.':
    'Скорость 0; помеха на его атаки и спасброски Ловкости; атаки по нему — с преимуществом.',
  'Speed 10 ft less until the next turn of whoever slowed it.':
    'Скорость меньше на 10 фт до следующего хода того, кто замедлил.',
  'It cannot act and fails Strength and Dexterity saves; attacks against it have Advantage.':
    'Не может действовать, проваливает спасброски Силы и Ловкости; атаки по нему — с преимуществом.',
  'It cannot act or move and drops prone; attacks against it have Advantage, critical from 5 ft.':
    'Не может действовать и двигаться, падает ничком; атаки по нему — с преимуществом, с 5 фт — критические.',
  'an unidentified creature': 'неизвестное существо',
  'from {name}': 'источник: {name}',
  'until the start of the next turn of {name}': 'до начала следующего хода: {name}',
  'until the start of a turn of {name}; turns left: {turns}':
    'до начала хода: {name}; осталось ходов: {turns}',
  'until the end of the next turn of {name}': 'до конца следующего хода: {name}',
  'until the end of a turn of {name}; turns left: {turns}':
    'до конца хода: {name}; осталось ходов: {turns}',
  'a {ability} save of DC {dc} ends it': 'снимается спасброском ({ability}, СЛ {dc})',
  'How they end': 'Как закончатся',
  'What they do': 'Что они значат',
  'Conditions of {name}': 'Состояния: {name}',
  'It comes from (optional)': 'Источник (необязательно)',
  'No one in particular': 'Никто конкретный',
  'It ends': 'Когда закончится',
  'When you lift it': 'Когда вы его снимете',
  'At the start of a turn': 'В начале хода',
  'At the end of a turn': 'В конце хода',
  'Whose turn': 'Чей ход',
  'After how many of those turns': 'Через сколько таких ходов',
  'From 1 to 100.': 'От 1 до 100.',
  'A save ends it at the end of each of its turns':
    'Спасбросок в конце каждого его хода снимает состояние',
  'Saving throw': 'Спасбросок',
  'Difficulty (DC)': 'Сложность (СЛ)',
  'From 1 to 30.': 'От 1 до 30.',
  'Set the level': 'Установить уровень',
  '{name}: no longer exhausted': '{name}: истощение снято',
  '{name}: Exhaustion {level}': '{name}: истощение {level}',
  'Your conditions fail this save outright.':
    'Из-за ваших состояний этот спасбросок проваливается сам.',
  'Your conditions give Advantage.': 'Ваши состояния дают преимущество.',
  'Your conditions give Disadvantage.': 'Ваши состояния дают помеху.',
  'Your conditions cancel it out: one die.': 'Ваши состояния гасят его: бросается одна кость.',
  'Exhaustion: {penalty} to the roll.': 'Истощение: {penalty} к броску.',
  'charmed by target': 'цель очаровала вас',
  Dash: 'Рывок',
  Disengage: 'Отход',
  Dodge: 'Уклонение',
  Help: 'Помощь',
  Hide: 'Засада',
  Influence: 'Влияние',
  'Ready an action': 'Подготовка',
  'Utilize: use an object': 'Использование: применить предмет',
  'Help an ally against {target}': 'Помощь союзнику против: {target}',
  'Ready an action against {target}': 'Подготовка против: {target}',
  'Influence {target}': 'Влияние: {target}',
  Search: 'Поиск',
  Study: 'Изучение',
  Utilize: 'Использование',
  'Took the {action} action': 'Действие «{action}»',
  'Took the {action} action at {target}': 'Действие «{action}»: {target}',
  'Until your next turn, attacks against you have Disadvantage and your Dexterity saves Advantage.':
    'До вашего следующего хода атаки по вам совершаются с помехой, а ваши спасброски Ловкости — с преимуществом.',
  'Move as far again as your Speed this turn.':
    'В этот ход вы можете пройти ещё столько же, сколько позволяет ваша скорость.',
  'Your movement provokes no Opportunity Attacks this turn.':
    'В этот ход ваше перемещение не провоцирует атак.',
  'From cover, a DC 15 Stealth check: on a success you are Invisible until you attack or are found.':
    'Из-за укрытия — проверка Скрытности Сл 15: при успехе вы невидимы, пока не атакуете или вас не найдут.',
  'A Wisdom check to notice what is not obvious: Perception, Insight, Medicine or Survival.':
    'Проверка Мудрости, чтобы заметить неочевидное: Внимательность, Проницательность, Медицина или Выживание.',
  'An Intelligence check to recall or work out: Arcana, History, Investigation, Nature or Religion.':
    'Проверка Интеллекта, чтобы вспомнить или понять: Магия, История, Анализ, Природа или Религия.',
  'Use an object that takes your action.': 'Применить предмет, которому нужно ваше действие.',
  'An ally’s next attack on this foe before your next turn has Advantage.':
    'Следующая атака союзника по этому врагу до вашего следующего хода совершается с преимуществом.',
  'Hold an attack for a moment you name; when it comes, you make it with your Reaction.':
    'Придержите атаку до названного вами момента: когда он наступит, вы атакуете реакцией.',
  'A Charisma or Animal Handling check to sway this creature.':
    'Проверка Харизмы или Ухода за животными, чтобы склонить это существо на свою сторону.',
  'Ready an attack': 'Подготовить атаку',
  'When it happens': 'Когда это случится',
  'When it steps out of cover': 'Когда он выйдет из-за укрытия',
  Skill: 'Навык',
  'Which attack': 'Какой атакой',
  'Ready the attack': 'Подготовить атаку',
  'closer to fear': 'ближе к страху нельзя',
  'invalid skill': 'не тот навык',
  'not a foe': 'это не враг',
  'no cover to hide': 'нет укрытия',
});
