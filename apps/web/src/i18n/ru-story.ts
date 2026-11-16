import { registerRussian } from '@ltw/ui';

/**
 * Russian for a hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5):
 * the Story tab of the character's sheet.
 */
registerRussian({
  // The privacy notice
  'Your hero’s story and your notes: the backstory you write for your hero (you and the DM read it) and your private notes (only you read them — the DM does not).':
    'История героя и ваши заметки: предыстория, которую вы пишете своему герою (её читаете вы и мастер), и ваши личные заметки (их читаете только вы — мастер их не видит).',
  Story: 'История',
  // The backstory
  Backstory: 'Предыстория',
  'You and your DM read this. Nobody else at the table does.':
    'Это читаете вы и мастер. Больше никто за столом.',
  'You and this hero’s player read this. Nobody else at the table does.':
    'Это читаете вы и игрок этого героя. Больше никто за столом.',
  'The DM wrote this down. You may change it.': 'Это записал мастер. Вы можете изменить текст.',
  'Where does {name} come from, and what does {name} want?':
    '{name}: откуда этот герой и чего он хочет?',
  '{count} of {max} characters': '{count} из {max} знаков',
  'Save the backstory': 'Сохранить предысторию',
  'Saved.': 'Сохранено.',
  'That was not saved. Try again.': 'Не сохранилось. Попробуйте ещё раз.',
  'The backstory could not be read. Close the sheet and open it again.':
    'Не удалось прочитать предысторию. Закройте лист и откройте его снова.',
  // Private notes
  'My notes': 'Мои заметки',
  'Only you read these: not the DM, not the other players.':
    'Их читаете только вы: ни мастер, ни другие игроки.',
  'Your notes could not be read. Close the sheet and open it again.':
    'Не удалось прочитать заметки. Закройте лист и откройте его снова.',
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
  'Delete this note?': 'Удалить эту заметку?',
  'Delete this note for good?': 'Удалить эту заметку насовсем?',
  'Yes, delete it': 'Да, удалить',
  'No notes yet: a clue, a name to remember, a plan.':
    'Заметок пока нет: улика, имя, которое стоит запомнить, план.',
});
