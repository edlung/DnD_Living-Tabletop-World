import { registerRussian } from '@ltw/ui';

/**
 * Russian for a campaign that plays on another server since a move (docs/adr/0061-local-mode.md
 * §5, Stage 697): the table's notice and the account's list.
 */
registerRussian({
  'This campaign is played on {where} since {when}: here you can look, not play.':
    'Эта кампания идёт на {where} с {when}: здесь её можно смотреть, но не играть.',
  'Played on {where} since {when}: here you can look, not play.':
    'Идёт на {where} с {when}: здесь её можно смотреть, но не играть.',
});
