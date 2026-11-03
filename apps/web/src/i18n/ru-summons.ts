import { registerRussian } from '@ltw/ui';

/**
 * Russian for the summons (docs/adr/0056-characters-from-the-srd.md §5): what a summoning spell
 * calls up, the commander's attack, and the refusals. The creatures' and their attacks' names come
 * from the server in the campaign's language, as the Russian SRD gives them.
 */
registerRussian({
  // What a spell calls up
  'The steed’s creature type': 'Тип существа скакуна',
  'The insect’s form': 'Форма насекомого',
  'Its Breath Weapon': 'Его оружие дыхания',
  Objects: 'Предметы',
  Celestial: 'Небожитель',
  Fey: 'Фея',
  Fiend: 'Исчадие',
  Centipede: 'Многоножка',
  Spider: 'Паук',
  Wasp: 'Оса',
  'Medium or smaller': 'Средний или меньше',
  Huge: 'Огромный',
  '{used} of {budget}: a Large object counts two, a Huge one three.':
    '{used} из {budget}: Большой предмет считается за два, Огромный — за три.',
  '{spell}: what comes?': '{spell}: кого призвать?',
  'Cast {spell} beside you': 'Заклинание: {spell} — рядом с вами',
  '{spell}: {names} appears at your call.': '{spell}: на зов является {names}.',
  '{spell}: {names} appear at your call.': '{spell}: на зов являются {names}.',
  // The commander's turn
  'Its attack': 'Его атака',
  '{name}: used this turn, with the attacks': '{name}: уже в этот ход, вместе с атаками',
  // Refusals
  'summon choice': 'выберите, кого призвать',
  'no room': 'рядом нет места',
  'used this turn': 'уже было в этот ход',
});
