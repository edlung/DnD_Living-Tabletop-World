import { registerRussian } from '@ltw/ui';

/**
 * Russian for a quiet request for a pause (docs/adr/0073-table-ideas.md §2): the player's line
 * and the DM's card. The button's own words are the agreement's (`ru-agreement.ts`).
 */
registerRussian({
  'The DM has seen that you asked for a pause.': 'Мастер увидел, что вы попросили паузу.',
  'Only the DM will see this. While a game is played, “Ask for a pause” is here and on your own screen.':
    'Это увидит только мастер. Пока идёт игра, кнопка «Попросить паузу» есть здесь и на вашем экране.',
  'A request for a pause': 'Просьба о паузе',
  '{name} asks for a pause. Only you see this.': '{name} просит паузу. Это видите только вы.',
  'That did not work. Try again.': 'Не получилось. Попробуйте ещё раз.',
});
