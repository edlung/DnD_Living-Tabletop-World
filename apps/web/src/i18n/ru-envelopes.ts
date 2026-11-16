import { registerRussian } from '@ltw/ui';

/**
 * Russian for sealed envelopes (docs/adr/0073-table-ideas.md §9): the DM's sealing and list, and
 * the party's view of an envelope from outside.
 */
registerRussian({
  // The DM seals
  'Seal in an envelope': 'Запечатать в конверт',
  'Seal in an envelope: {title}': 'Запечатать в конверт: {title}',
  'What the outside says': 'Что написано снаружи',
  'The party reads this while it is sealed — “Open after the battle”, “For the bravest”. Nothing of the inside shows.':
    'Отряд читает это, пока конверт запечатан: «Открыть после боя», «Самому смелому». Содержимое не видно.',
  'Write what the outside says.': 'Напишите, что будет снаружи.',
  'It opens': 'Когда откроется',
  'When I open it': 'Когда я открою',
  'By itself, when this evening’s chapter is written': 'Сам, когда будет написана глава этого вечера',
  'Seal it': 'Запечатать',
  'Sealed: the party sees the envelope, not what is inside.':
    'Запечатано: отряд видит конверт, но не то, что внутри.',
  'There are as many envelopes as a campaign holds: delete an opened one first.':
    'Конвертов уже столько, сколько вмещает кампания: сначала удалите открытый.',
  'The envelope could not be sealed. Try again.': 'Не удалось запечатать конверт. Попробуйте ещё раз.',
  // The DM's list
  Envelopes: 'Конверты',
  'Opens when you say': 'Откроется, когда вы скажете',
  'Opens when the next evening’s chapter is written':
    'Откроется, когда будет написана глава следующего вечера',
  'Opens when the chapter of “{evening}” is written': 'Откроется, когда будет написана глава «{evening}»',
  'Opened {when}': 'Открыт {when}',
  'Inside: {title}': 'Внутри: {title}',
  'Open it now': 'Открыть сейчас',
  'Open now: {label}': 'Открыть сейчас: {label}',
  'Delete the envelope: {label}': 'Удалить конверт: {label}',
  'Opened: the party has it as a handout.': 'Открыт: отряд получил его как материал.',
  'It cannot open yet: the party does not know what is pictured inside.':
    'Пока не открыть: отряд ещё не знает того, что изображено внутри.',
  // The party's Journal
  'Sealed envelopes': 'Запечатанные конверты',
  'Sealed. It opens when the DM says.': 'Запечатан. Откроется, когда скажет мастер.',
  'Sealed. It opens when the evening’s chapter is written.':
    'Запечатан. Откроется, когда будет написана глава вечера.',
});
