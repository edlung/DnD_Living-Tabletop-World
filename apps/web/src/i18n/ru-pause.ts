import { registerRussian } from '@ltw/ui';

/**
 * Russian for a quiet request for a pause (docs/adr/0073-table-ideas.md §2): the player's line
 * and the DM's card. The button's own words are the agreement's (`ru-agreement.ts`).
 */
registerRussian({
  'The DM has seen that you asked for a pause. You can ask again in a minute.':
    'Мастер увидел, что вы попросили паузу. Через минуту можно попросить ещё раз.',
  'Only the DM will see what you write. While the game is on, “Ask for a pause” is here and on the game screen.':
    'То, что вы напишете, увидит только мастер. Пока идёт игра, кнопка «Попросить паузу» есть здесь и на экране игры.',
  'The game is paused. Resume it in Session.': 'Игра на паузе. Продолжить можно в «Сессии».',
  '{name} will read that you have seen it.': '{name} прочитает, что вы видели просьбу.',
  '{name} asks for a pause. Only you see this.': '{name} просит паузу. Это видите только вы.',
  'That did not work. Try again.': 'Не получилось. Попробуйте ещё раз.',
});
