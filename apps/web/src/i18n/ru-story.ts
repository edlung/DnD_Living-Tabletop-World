import { registerRussian } from '@ltw/ui';

/**
 * Russian for a hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5):
 * the Story tab of the character's sheet.
 */
registerRussian({
  // The privacy notice
  'Your hero’s story and your notes: the backstory you write for your hero (you and the DM read it) and your private notes (only you read them — the DM does not).':
    'История героя и ваши заметки: история, которую вы пишете своему герою (её читаете вы и мастер), и ваши личные заметки (их читаете только вы — мастер их не видит).',
  Story: 'История',
  // The backstory
  Backstory: 'История героя',
  'You and the DM read this, and either of you may change it. Nobody else at the table sees it.':
    'Это читаете вы и мастер, и каждый из вас может изменить текст. Больше никто за столом его не видит.',
  'You and this hero’s player read this, and either of you may change it. Nobody else at the table sees it.':
    'Это читаете вы и игрок этого героя, и каждый из вас может изменить текст. Больше никто за столом его не видит.',
  'This was changed while you were writing. Saving replaces it.':
    'Пока вы писали, текст изменили. Сохранение заменит его.',
  'The backstory could not be read.': 'Не удалось прочитать историю героя.',
  // Leaving with unsaved words
  'Unsaved words': 'Несохранённый текст',
  'You have not saved what you wrote. Close anyway?':
    'Вы не сохранили написанное. Всё равно закрыть?',
  'Keep writing': 'Писать дальше',
  'Close without saving': 'Закрыть без сохранения',
  'The DM wrote this down. You may change it.': 'Это записал мастер. Вы можете изменить текст.',
  'Where does {name} come from, and what does {name} want?':
    '{name}: откуда этот герой и чего хочет?',
  '{count} of {max} characters': '{count} из {max} знаков',
  'Save the backstory': 'Сохранить историю героя',
  'Saved.': 'Сохранено.',
  'That was not saved. Try again.': 'Не сохранилось. Попробуйте ещё раз.',
  // Private notes
  'My notes': 'Мои заметки',
  'Only you read these. The DM and the other players do not see them.':
    'Их читаете только вы. Мастер и другие игроки их не видят.',
  'Your notes could not be read.': 'Не удалось прочитать заметки.',
  'This hero’s player may also keep private notes here. Only they read them — you do not.':
    'Игрок этого героя может вести здесь личные заметки. Их читает только сам игрок — вам они не видны.',
  '{count} of {max} notes': 'Заметок: {count} из {max}',
  'That was not deleted. Try again.': 'Не удалилось. Попробуйте ещё раз.',
  'Write a note': 'Написать заметку',
  'The notebook is full: delete a note to write another.':
    'Блокнот полон: удалите заметку, чтобы написать новую.',
  'A new note': 'Новая заметка',
  'Change the note': 'Изменить заметку',
  'What it is about (optional)': 'О чём она (необязательно)',
  'The note': 'Заметка',
  'Save the note': 'Сохранить заметку',
  'The note is saved.': 'Заметка сохранена.',
  'The note is deleted.': 'Заметка удалена.',
  'A note': 'Заметка без названия',
  'Changed {day}': 'Изменена {day}',
  'Delete this note for good?': 'Удалить эту заметку насовсем?',
  'Yes, delete it': 'Да, удалить',
  'No notes yet. Write down a clue, a name to remember, a plan.':
    'Заметок пока нет. Запишите улику, имя, которое стоит запомнить, или план.',
});
