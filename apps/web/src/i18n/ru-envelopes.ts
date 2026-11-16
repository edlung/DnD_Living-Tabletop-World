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
  'The party reads this while it is sealed — “Open after the battle”, “For the bravest”. Nothing of the inside shows. Up to {max} characters.':
    'Отряд читает это, пока конверт запечатан: «Открыть после боя», «Самому смелому». Содержимое не видно. До {max} знаков.',
  'Write what the outside says.': 'Напишите, что будет снаружи.',
  'It opens': 'Когда откроется',
  'When I open it': 'Когда я открою',
  'By itself, when the evening’s chapter is written': 'Сам, когда будет написана глава вечера',
  'The game on now, or the next one if none is on. If that evening ends with no chapter, it stays sealed until you open it.':
    'Той игры, что идёт сейчас, а если игра не идёт — следующей. Если вечер закончится без главы, конверт останется запечатанным, пока вы не откроете его сами.',
  'It waits in “Envelopes” below until you press “Open it now”.':
    'Он ждёт ниже, в «Конвертах», пока вы не нажмёте «Открыть сейчас».',
  'It holds a copy: changing the kept handout later does not change it.':
    'В конверте копия: если потом изменить заготовку, он не изменится.',
  'It has a picture: it opens only once the party knows what is pictured.':
    'Внутри картинка: конверт откроется, только когда отряд узнает, что на ней.',
  'Seal it': 'Запечатать',
  'Sealed: the party sees the envelope, not what is inside.':
    'Запечатано: отряд видит конверт, но не то, что внутри.',
  'A campaign holds {max} envelopes. Delete one first.':
    'В кампании помещается {max} конвертов. Сначала удалите один.',
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
  'Open it now: {label}': 'Открыть сейчас: {label}',
  'Delete the envelope: {label}': 'Удалить конверт: {label}',
  'Remove from the list': 'Убрать из списка',
  'Remove from the list: {label}': 'Убрать из списка: {label}',
  'Delete this sealed envelope? It leaves the party’s Journal and never opens.':
    'Удалить запечатанный конверт? Он исчезнет из журнала отряда и уже не откроется.',
  'Remove it from this list? The party keeps the handout.':
    'Убрать его из списка? Материал у отряда останется.',
  'Envelope deleted.': 'Конверт удалён.',
  'Opened: the party has it as a handout.': 'Открыт: отряд получил его как материал.',
  'It cannot open yet: the party does not know what is pictured inside.':
    'Пока открыть нельзя: отряд ещё не знает, что на картинке внутри.',
  // The party's Journal
  'Sealed envelopes': 'Запечатанные конверты',
  'Sealed. It opens when the DM says.': 'Запечатан. Откроется, когда скажет мастер.',
  'Sealed. It opens when the evening’s chapter is written.':
    'Запечатан. Откроется, когда будет написана глава вечера.',
});
