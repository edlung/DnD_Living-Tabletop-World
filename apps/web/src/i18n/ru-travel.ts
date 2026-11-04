import { registerRussian } from '@ltw/ui';

/**
 * Russian for the world map and travel (Stage 670g, docs/adr/0057-encounters-maps-loot.md §10): the
 * map in the Places sheet, the DM's map editor and routes, a journey's pace, terrain and hours.
 */
registerRussian({
  'Loading the map…': 'Загружаем карту…',
  'Map of {region}': 'Карта: {region}',
  Map: 'Карта',
  'No map yet: choose a place whose picture is the map, and pin places on it.':
    'Карты пока нет: выберите место, чья картинка станет картой, и отметьте на ней места.',
  'No map of these lands yet.': 'Карты этих земель пока нет.',
  // As the workshop has it, for the play screens too.
  Region: 'Регион',
  Routes: 'Пути',
  '{from} to {to}: {miles} mi, {terrain}': '{from} — {to}: миль {miles}, {terrain}',
  'a good road': 'хорошая дорога',
  '{place}, where you are': '{place} — вы здесь',
  // The DM's journey
  Travel: 'Путешествие',
  'Where to': 'Куда',
  '{place}, {miles} mi': '{place}, миль: {miles}',
  'Pace: on {terrain}{road}, {fastest} at most': 'Темп: {terrain}{road}, не быстрее: {fastest}',
  ', a good road': ', хорошая дорога',
  'Fast pace': 'Быстрый темп',
  'Normal pace': 'Обычный темп',
  'Slow pace': 'Медленный темп',
  'fast pace': 'быстрым темпом',
  'normal pace': 'обычным темпом',
  'slow pace': 'медленным темпом',
  '4 miles an hour. Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks.':
    '4 мили в час. Помеха на проверки Мудрости (Внимательность или Выживание) и Ловкости (Скрытность).',
  '3 miles an hour. Disadvantage on Dexterity (Stealth) checks.':
    '3 мили в час. Помеха на проверки Ловкости (Скрытность).',
  '2 miles an hour. Advantage on Wisdom (Perception or Survival) checks.':
    '2 мили в час. Преимущество на проверки Мудрости (Внимательность или Выживание).',
  'Hours on the road a day': 'Часов в пути за день',
  'Who travels': 'Кто идёт',
  'Hours on the road: {hours}; days: {days}.': 'Часов в пути: {hours}; дней: {days}.',
  'Past 8 hours a day, each traveller makes a Constitution save each hour (DC 11 and up) or gains a level of Exhaustion.':
    'Сверх 8 часов в день каждый путник каждый час делает спасбросок Телосложения (Сл 11 и выше) или получает уровень истощения.',
  'Set out': 'В путь',
  'too fast': 'слишком быстро',
  // Terrains (SRD 5.2.1 Travel Terrain)
  arctic: 'арктика',
  coastal: 'побережье',
  desert: 'пустыня',
  forest: 'лес',
  grassland: 'равнины',
  hills: 'холмы',
  mountains: 'горы',
  swamp: 'болото',
  Underdark: 'Подземье',
  town: 'город',
  // The DM's map editor
  'Edit the map': 'Править карту',
  'The map is the picture of': 'Карта — это картинка места',
  'Place to pin': 'Какое место отметить',
  'Across, %': 'По ширине, %',
  'Down, %': 'По высоте, %',
  'Click the map to pin the chosen place there.':
    'Щёлкните по карте, чтобы отметить там выбранное место.',
  'Save the pins': 'Сохранить отметки',
  'Unpin {place}': 'Снять отметку: {place}',
  'A route': 'Путь',
  'First place': 'Первое место',
  'Second place': 'Второе место',
  Miles: 'Миль',
  Terrain: 'Местность',
  'A good road runs there': 'Там идёт хорошая дорога',
  'Change the route': 'Изменить путь',
  'Set the route': 'Задать путь',
  'Take the route away': 'Убрать путь',
  // The DM's history
  'Travelled from {from} to {to}, {pace}: {hours} h on the road':
    'Путь из «{from}» в «{to}» {pace}: {hours} ч в пути',
  'Exhaustion from the road: {count}': 'истощение в пути: {count}',
});
