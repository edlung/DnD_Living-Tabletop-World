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
  'Coming: {names}': 'Кто придёт: {names}',
  'Can’t come: {names}': 'Кто не сможет: {names}',
  'No answer yet: {names}': 'Кто пока не ответил: {names}',
  'Your answer. Press it again to take it back.': 'Ваш ответ. Нажмите его ещё раз, чтобы снять.',
  'Your answer was not kept. Try again.': 'Ответ не сохранился. Попробуйте ещё раз.',
  'Who’s coming': 'Кто придёт',
  'Everyone answers on their own screen. Answer here for someone who told you aloud: it replaces their own answer, and they can change it. Press an answer again to clear it. A new date asks everyone again.':
    'Каждый отвечает на своём экране. Здесь можно ответить за того, кто сказал вслух: ваш ответ заменит его собственный, и он сможет его изменить. Нажмите ответ ещё раз, чтобы снять его. Новая дата спросит всех заново.',
  coming: 'придёт',
  'can’t come': 'не сможет',
  'no answer yet': 'пока нет ответа',
  '{name} is coming': '{name} придёт',
  '{name} can’t come': '{name} не сможет',
  Coming: 'Придёт',
  'Can’t': 'Не сможет',
  'The answer was not kept. Try again.': 'Ответ не сохранился. Попробуйте ещё раз.',
});
