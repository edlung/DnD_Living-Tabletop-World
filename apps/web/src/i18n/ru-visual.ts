import { registerRussian } from '@ltw/ui';

/**
 * Russian for the Stage 320 shell, scene and conversation (docs/STAGE_320_DESIGN.md §7: every
 * new string in both languages). Keys are the English source strings; names stay nominative
 * (docs/adr/0031-play-language.md §5).
 */
registerRussian({
  // Shell: top bar, dock, sheets
  'Enter world': 'Войти в мир',
  'World tools': 'Инструменты мира',
  'DM tools': 'Инструменты мастера',
  Places: 'Места',
  Journal: 'Журнал',
  'Add to the world': 'Добавить в мир',
  Add: 'Добавить',
  Encounter: 'Схватка',
  'Encounter (DM)': 'Схватка (мастер)',
  'Time and weather': 'Время и погода',
  Time: 'Время',
  History: 'История',
  'Close {name}': 'Закрыть: {name}',
  'Close the Chronicle': 'Закрыть хронику',
  'Dismiss the result': 'Скрыть результат',

  // Scene
  'No approved image yet': 'Изображения пока нет',
  'Symbolic arrangement — no distances shown': 'Условная расстановка — расстояния не показаны',
  Explore: 'Осмотреть',
  'this place': 'это место',
  'What the stage shows': 'Что показывает сцена',

  // Places and the journal
  'Shows another place you know. It does not move your character.':
    'Показывает другое известное вам место. Ваш персонаж никуда не перемещается.',
  Hypotheses: 'Гипотезы',
  'No hypothesis is recorded in this perspective yet.': 'В этом виде пока не записано гипотез.',

  // Conversation
  'Conversation with {name}': 'Разговор: {name}',
  'Says: {name}': 'Говорит: {name}',
  Conversation: 'Разговор',
  'Leave the conversation': 'Закончить разговор',
  '“{line}”': '«{line}»',
  'What to say': 'Что сказать',
  'Keep talking': 'Продолжить разговор',

  // DM tools
  'World time': 'Время в мире',
  Weather: 'Погода',
  'Creating…': 'Создаём…',
  'Perform {npc} (DM)': 'Сыграть: {npc} (мастер)',
  'The DM acts for creatures with the Encounter tools (suggested turn).':
    'Мастер действует за существ через инструменты схватки (предложенный ход).',
  'To undo it, use History in the DM tools.':
    'Чтобы отменить, откройте «Историю» в инструментах мастера.',
});
