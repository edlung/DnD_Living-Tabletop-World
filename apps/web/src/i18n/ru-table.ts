import { registerRussian } from '@ltw/ui';

/**
 * Russian for the second AI stand-in pass (Stage 360, owner decisions 11): a player's action in
 * the DM history and the player's notice of its undo, the waiting draft, the state of a
 * proposal, the weather choice and the action words. Keys are the English source strings;
 * names stay nominative (docs/adr/0031-play-language.md §5).
 */
registerRussian({
  // The DM history: a blocker that is a player's own action
  'A player’s action ({name}): {action}': 'Действие игрока ({name}): {action}',
  'Undo the action of {name} first': 'Сначала отменить действие игрока ({name})',
  'This takes back what the player of {name} did: {action}. The player will be told. Undo it?':
    'Это отменит то, что сделал игрок ({name}): {action}. Игрок получит об этом сообщение. Отменить?',
  'Undo the player’s action': 'Отменить действие игрока',
  'Keep it': 'Оставить',
  // The player's notice
  'Undone by the DM': 'Отменено мастером',
  'The DM undid your action: {action}': 'Мастер отменил ваше действие: {action}',
  'The DM undid some of your actions:': 'Мастер отменил несколько ваших действий:',
  'The world is as it was before; what followed from it is gone.':
    'Мир снова такой, каким был до этого; всё, что из этого последовало, исчезло.',
  Understood: 'Понятно',
  // The dock, the proposal, the weather
  'An unfinished proposal is waiting': 'Ждёт незавершённое предложение',
  'Confirm the edit': 'Подтвердить правку',
  'Confirmed: it is in the world now, seen as follows.':
    'Подтверждено: это уже в мире, и видят это так:',
  'Undone: the world no longer holds it, and no one sees it.':
    'Отменено: этого больше нет в мире, и никто этого не видит.',
  'Discarded: it never reached the world, and no one saw it.':
    'Отброшено: это не попало в мир, и никто этого не видел.',
  'Choose the weather': 'Выберите погоду',
  // Action words
  Trade: 'Торговать',
  'Insight check': 'Проверка проницательности',
  'Longbow attack': 'Атака из длинного лука',
  'long range': 'большая дистанция, с помехой',
  // Prepared encounters (Stage 605); the workshop's dictionary words the heading the same way
  'Prepared encounters': 'Подготовленные столкновения',
  'Foes: {count}': 'Противники: {count}',
  'Joining: {names}': 'Участвуют: {names}',
  'The answer was lost on the way. Start again: it will not start twice.':
    'Ответ потерялся по дороге. Начните ещё раз: дважды не начнётся.',
  'Start: {title}': 'Начать: {title}',
  'Starting…': 'Начинаем…',
  Start: 'Начать',
  'None of its foes can fight any more.': 'Ни один из её противников уже не может сражаться.',
  'Nobody of the party is at {place} yet.': '{place}: здесь пока нет никого из отряда.',
});
