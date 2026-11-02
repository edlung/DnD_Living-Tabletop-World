import { registerRussian } from '@ltw/ui';

/**
 * Russian for the player's companion and online play beyond the chat (docs/adr/0044-online-play.md
 * §3–§8): the table's questions and whom it waits for.
 */
registerRussian({
  'The DM asks: {check}': 'Мастер просит: {check}',
  'Checks the DM asked for: {count}': 'Проверок от мастера: {count}',
  'Waiting for: {checks}': 'Ждём: {checks}',
});
