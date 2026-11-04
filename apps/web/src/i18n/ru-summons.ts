import { registerRussian } from '@ltw/ui';

/**
 * Russian for the summons and Wild Shape (docs/adr/0056-characters-from-the-srd.md §5): what a
 * summoning spell calls up, the commander's attack, a Druid's Beast forms, and the refusals. The creatures' and their attacks' names come
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
  'Choose a creature on the board for its attacks.': 'Выберите существо на поле для его атак.',
  '{name}: used this turn, with the attacks': '{name}: уже в этот ход, вместе с атаками',
  // Wild Shape (§5)
  'In the shape of: {form}': 'В облике: {form}',
  '{state}, in the shape of: {form}': '{state}, в облике: {form}',
  'Beast form': 'Облик зверя',
  '{name} (CR {rating})': '{name} (ПО {rating})',
  '{name} (CR {rating}, flies)': '{name} (ПО {rating}, летает)',
  'Left the Wild Shape': 'Покинул Дикий облик',
  'Took a Wild Shape: {form}': 'Принял Дикий облик: {form}',
  'You are yourself again.': 'Вы снова в своём облике.',
  'You take the Beast’s shape.': 'Вы принимаете облик зверя.',
  'You take the Beast’s shape: 1 use left.':
    'Вы принимаете облик зверя. Осталось одно использование.',
  'You take the Beast’s shape: {count} uses left.':
    'Вы принимаете облик зверя. Осталось использований: {count}.',
  'Attack {target} in your Wild Shape form': 'Атаковать {target} в Диком облике',
  'Attack in your Wild Shape form': 'Атаковать в Диком облике',
  'form attack': 'атака облика',
  // Refusals
  'not a form': 'этот облик вам пока недоступен',
  shaped: 'в Диком облике заклинаний нет',
  'not shaped': 'вы не в Диком облике',
  'summon choice': 'выберите, кого призвать',
  'no room': 'рядом нет места',
  'used this turn': 'уже было в этот ход',
});
