import { registerRussian } from '@ltw/ui';

/**
 * Russian for "I'll come / I can't" (docs/adr/0073-table-ideas.md §10): a player's answer under
 * the next game's date, and the DM's list on the Session sheet.
 */
registerRussian({
  'Who comes to the next game': 'Кто придёт на следующую игру',
  'Will you come?': 'Вы придёте?',
  'I’ll come': 'Приду',
  'I can’t': 'Не смогу',
  'Coming: {names}': 'Придут: {names}',
  'Can’t come: {names}': 'Не смогут: {names}',
  'No answer yet: {names}': 'Пока не ответили: {names}',
  'Your answer was not kept. Try again.': 'Ответ не сохранился. Попробуйте ещё раз.',
  'Who comes': 'Кто придёт',
  'Everyone answers on their own screen. Answer here for someone who told you aloud. A new date asks everyone again.':
    'Каждый отвечает на своём экране. Здесь можно ответить за того, кто сказал вслух. Новая дата спросит всех заново.',
  comes: 'придёт',
  'can’t come': 'не сможет',
  'no answer yet': 'пока нет ответа',
  '{name} comes': '{name} придёт',
  '{name} can’t come': '{name} не сможет',
  Comes: 'Придёт',
  'Can’t': 'Не сможет',
  'The answer was not kept. Try again.': 'Ответ не сохранился. Попробуйте снова.',
});
