import { registerRussian } from '@ltw/ui';

/**
 * Russian for rests, Hit Point Dice, milestone levels and the quest log (Stage 530).
 */
registerRussian({
  // The DM's rests
  Rest: 'Отдых',
  'A short rest is under way: players spend Hit Point Dice.':
    'Идёт короткий отдых: игроки тратят кости хитов.',
  'A short rest takes an hour; a long rest, eight hours, restores the whole party.':
    'Короткий отдых длится час; долгий — восемь часов и восстанавливает всю группу.',
  'No rest while a fight is running.': 'Во время боя отдыхать нельзя.',
  'End the short rest': 'Закончить короткий отдых',
  'Short rest (1 hour)': 'Короткий отдых (1 час)',
  'Long rest (8 hours)': 'Долгий отдых (8 часов)',

  // What the table answered
  'No rest now: a fight is running, or a short rest is already under way.':
    'Сейчас отдохнуть нельзя: идёт бой или короткий отдых уже начат.',
  'No short rest is under way.': 'Короткий отдых сейчас не идёт.',
  'The short rest is over, or a fight began.': 'Короткий отдых закончился или начался бой.',
  'The level could not be granted. Try again.': 'Не удалось повысить уровень. Попробуйте ещё раз.',
  'No Hit Point Die can be spent now.': 'Сейчас нельзя потратить кость хитов.',
  'That level cannot be granted.': 'Этот уровень дать нельзя.',
  'Regained {count} hit points.': 'Восстановлено хитов: {count}.',
  'The party settles for a short rest. Players can spend Hit Point Dice now.':
    'Группа устраивает короткий отдых. Игроки могут тратить кости хитов.',
  'The party rests eight hours: hit points, spell slots and Hit Point Dice are restored.':
    'Группа отдыхает восемь часов: хиты, ячейки заклинаний и кости хитов восстановлены.',
  'The short rest is over.': 'Короткий отдых окончен.',
  'A new level is granted.': 'Новый уровень получен.',
  'That was already done.': 'Это уже сделано.',

  // Hit Point Dice on the sheet
  'Hit Point Dice': 'Кости хитов',
  '{left} of {total} left': 'осталось {left} из {total}',
  'Spend a d{sides}': 'Потратить к{sides}',
  'Hit Point Dice are spent in a short rest the DM calls.':
    'Кости хитов тратятся во время короткого отдыха, который объявляет мастер.',
  'Unconscious: no Hit Point Die can be spent.': 'Без сознания: кости хитов тратить нельзя.',
  'At full hit points: nothing to recover.': 'Хиты полные: восстанавливать нечего.',

  // The DM's milestone level
  'Level (DM)': 'Уровень (мастер)',
  'Level {level}. A milestone level adds hit points and spell slots by the rules.':
    'Уровень {level}. Новый уровень по вехе добавляет хиты и ячейки заклинаний по правилам.',
  'The highest level is reached.': 'Достигнут наивысший уровень.',
  '{class} {from} → {to}': '{class} {from} → {to}',
  'Class to level': 'Класс для повышения',
  'Grant a level': 'Повысить уровень',
  'Grant {step}': 'Повысить: {step}',

  // The short rest over the world
  'Short rest: the players spend Hit Point Dice.': 'Короткий отдых: игроки тратят кости хитов.',
  'Short rest: spend Hit Point Dice to recover.':
    'Короткий отдых: потратьте кости хитов, чтобы восстановиться.',
  'Spend Hit Point Dice': 'Потратить кости хитов',

  // The quest log
  'No quest has begun yet.': 'Ни одно задание ещё не началось.',
  Completed: 'Выполнено',
  'In progress': 'В процессе',
  // The Journal's quests on a play screen (the workshop's dictionary words it the same way)
  Quests: 'Задания',
  // Rests by the full rules (docs/adr/0050-the-world-around.md §5–7)
  'The long rest is cut short after {hours} h: the party has a short rest instead. Players can spend Hit Point Dice now.':
    'Долгий отдых прерван через {hours} ч: отряду засчитан короткий отдых. Игроки могут тратить кости хитов.',
  '{name} had a long rest less than 24 hours ago: nothing restored.':
    '{name}: долгий отдых был меньше 24 часов назад — ничего не восстановлено.',
  'The short rest is over. {names} came round.': 'Короткий отдых окончен. В себя пришли: {names}.',
  'The long rest was cut short': 'Долгий отдых прерван',
  'After an hour or more the party has a short rest instead: Hit Point Dice, no more.':
    'Если прошёл хотя бы час, отряду засчитан короткий отдых: только кости хитов.',
  'Hours rested': 'Часов отдыха',
  'Cut short after {hours} h': 'Прервать через {hours} ч',
});
