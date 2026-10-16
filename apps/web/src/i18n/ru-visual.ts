import { registerRussian } from '@ltw/ui';

/**
 * Russian for the Stage 320 shell, scene, conversation and battlefield (docs/STAGE_320_DESIGN.md
 * §7: every new string in both languages). Keys are the English source strings; names stay
 * nominative (docs/adr/0031-play-language.md §5).
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

  // The battlefield (part B): the board and its view
  'Board view': 'Вид поля',
  'Flat board': 'Плоское поле',
  'Tilted board': 'Наклонное поле',
  'Zoom out': 'Отдалить',
  'Zoom in': 'Приблизить',
  'Square {x}, {y}': 'Клетка {x}, {y}',
  '{name} (you)': '{name} (вы)',
  '{current} / {max} HP': '{current} / {max} ОЗ',
  'difficult terrain': 'трудная местность',
  'half cover': 'половинное укрытие',
  'three-quarters cover': 'укрытие на три четверти',
  'in the area': 'в области',
  prone: 'сбит с ног',
  slowed: 'замедлен',
  unconscious: 'без сознания',
  'Reading the board': 'Как читать поле',
  'Difficult terrain': 'Трудная местность',
  'Half cover': 'Половинное укрытие',
  'Three-quarters cover': 'Укрытие на три четверти',
  'Total cover': 'Полное укрытие',

  // The battlefield: the anchor, the active combatant, the side panel, the turn tray
  'Turn order': 'Порядок ходов',
  'Active combatant': 'Действующий участник',
  'Initiative {total} (roll {roll}, modifier {modifier})':
    'Инициатива {total} (бросок {roll}, модификатор {modifier})',
  'Choose a square to move, or a combatant to act.':
    'Выберите клетку, чтобы идти, или участника боя, чтобы действовать.',
  'Act with the buttons of your turn below.': 'Действуйте кнопками своего хода внизу.',
  'You can act on your own turn.': 'Действовать можно в свой ход.',
  'Turn actions': 'Действия хода',
  Attack: 'Атаковать',
  'Hunter’s Mark': 'Метка охотника',

  // The reaction prompt
  'Reaction available': 'Доступна реакция',
  'Reaction: {name}': 'Реакция: {name}',
  Cast: 'Применить',
  'Don’t interfere': 'Не вмешиваться',
  'Counterspell spends a spell slot and may stop the spell. “Don’t interfere” lets the spell happen.':
    'Контрзаклинание тратит ячейку заклинаний и может остановить заклинание. «Не вмешиваться» даёт заклинанию сработать.',

  // Part C: the conversation holds what to say; cover on the board
  'What you can say to {name} is in your conversation.': '{name}: что сказать — в окне разговора.',
  'Go to the conversation': 'Перейти к разговору',
  total: 'полное',

  // Part C: the Chronicle as a book, and the flashback
  Chapters: 'Главы',
  'Write the first one from “Write a chapter” above.':
    'Напишите первую через «Написать главу (мастер)» выше.',
  'told from {who}': 'с точки зрения: {who}',
  'the party': 'отряд',
  'the public': 'все',
  'the DM': 'мастер',
  'another perspective': 'другой взгляд',
  'Told as the plain record': 'Рассказано простым перечнем событий',
  'Told by the narrator': 'Рассказано рассказчиком',
  'How it was written': 'Как написано',
  'No approved picture of this place yet': 'Утверждённого изображения этого места пока нет',
  'This chapter names no place': 'В этой главе не названо место',
  'No picture of this place to show': 'Показать изображение этого места нельзя',
  'Sources of this passage': 'Источники этого отрывка',
  noted: 'заметки',
  'Recorded as: {kinds}': 'Записано как: {kinds}',
  'Source references': 'Ссылки на источники',
  'a memory recorded': 'записанное воспоминание',
  'a record of what was known': 'запись о знании',
  'a change of state': 'смена состояния',
  'a fight beginning': 'начало боя',
  'a fight ending': 'конец боя',
  'a reaction': 'реакция',
  'a contradiction found': 'найденное противоречие',
  'information shared': 'переданные сведения',
  'an examination': 'осмотр',
  'time passing': 'ход времени',
  'a move': 'перемещение',
  'someone new in the world': 'новое лицо в мире',
  'Key moments': 'Ключевые моменты',
  // A chapter written since the reader opened the book (its ribbon tab)
  New: 'Новая',
  'What was learned': 'Что узнали',
  'People met': 'Встреченные',
  '— {name}': '— {name}',
  '— from your memory': '— из ваших воспоминаний',
  'With {names}': 'Рядом: {names}',
  Return: 'Вернуться',

  // Part C: the DM's tools
  Proposal: 'Предложение',
  'What will be added': 'Что будет добавлено',
  'Who will see': 'Кто увидит',
  'Until you confirm it, only you see this proposal.':
    'Пока вы не подтвердите, это предложение видите только вы.',
  'Players learn of {name} only through their characters, in play.':
    '{name}: игроки узнают об этом только через своих персонажей, в игре.',
  '{name} alone holds this account': 'Этот рассказ знает только {name}',
  '{name} alone knows this': 'Это знает только {name}',
  'The whole party knows this': 'Это знает весь отряд',
  'Anyone may know this': 'Это может знать каждый',
  'Only you, the DM, know this': 'Это знаете только вы, мастер',
  'It is world truth: no one is told it': 'Это истина мира: её никому не сообщают',
  '{name} will tell it when asked': 'Если спросят, расскажет {name}',
  'It will be told when asked': 'Если спросят, это расскажут',
  'Now: {weather}': 'Сейчас: {weather}',
  'Now: not set': 'Сейчас: не задана',
  'Undo is possible now: the world allows it.': 'Отмена возможна сейчас: мир это позволяет.',
});
