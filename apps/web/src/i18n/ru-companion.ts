import { registerRussian } from '@ltw/ui';

/**
 * Russian for the player's companion and online play beyond the chat (docs/adr/0044-online-play.md
 * §3–§8): the table's questions and whom it waits for.
 */
registerRussian({
  'The DM asks: {check}': 'Мастер просит: {check}',
  'Checks the DM asked for: {count}': 'Проверок от мастера: {count}',
  'Waiting for: {checks}': 'Ждём: {checks}',
  // One's own dice and a roll between the DM and one player (§4)
  'What your dice show': 'Что выпало на ваших кубиках',
  'Die {number}: d{sides}': 'Кубик {number}: d{sides}',
  'Enter the roll': 'Внести бросок',
  'My own dice': 'Свои кубики',
  'I roll my own dice': 'Бросаю свои кубики',
  'Who sees it': 'Кто видит',
  'Only me': 'Только я',
  '{name} and me': '{name} и я',
  'Only the DM and me': 'Только мастер и я',
  'In private: only that player sees the roll': 'Наедине: бросок видит только этот игрок',
  'in private': 'наедине',
  'own dice': 'свои кубики',
  'own dice, confirmed by the DM': 'свои кубики, мастер подтвердил',
  'only you and this player': 'только вы и этот игрок',
  'only you and the DM': 'только вы и мастер',
  'Confirm: the dice showed this': 'Подтвердить: так и выпало',
  'My d{sides} shows': 'На моём d{sides}',
  'Players roll their own dice and enter what they show':
    'Игроки бросают свои кубики и вносят, что выпало',
});
