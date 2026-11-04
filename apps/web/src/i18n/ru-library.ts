import { registerRussian } from '@ltw/ui';

/**
 * Russian for the DM's library (Stage 680b, docs/adr/0058-campaign-content.md §3–4): handouts kept
 * for later and given from the library, random tables written and rolled, and a table's roll in
 * the dice log. "Заготовка" is a kept handout; a table is "таблица случайностей".
 */
registerRussian({
  // Handouts kept for later
  'Keep for later': 'Отложить',
  'Kept for later: it waits below.': 'Отложено: материал ждёт ниже.',
  'Your library is full: delete a kept handout first.':
    'Библиотека заполнена: сначала удалите одну из заготовок.',
  'It could not be kept. Try again.': 'Не удалось отложить. Попробуйте ещё раз.',
  'Kept for later': 'Заготовки',
  'Reading your library…': 'Читаем вашу библиотеку…',
  'A handout you keep waits here until you give it.':
    'Отложенный материал ждёт здесь, пока вы его не выдадите.',
  'Not given yet': 'Ещё не выдан',
  'Given {when}': 'Выдан: {when}',
  'Picture: {name}': 'Картинка: {name}',
  'Give: {title}': 'Передать: {title}',
  'The handout could not be saved. Try again.':
    'Не удалось сохранить материал. Попробуйте ещё раз.',
  'Save the changes': 'Сохранить изменения',
  // Random tables
  'Random tables': 'Таблицы случайностей',
  'Write a table': 'Написать таблицу',
  'Only you see them. A roll for the table shows everyone its result.':
    'Их видите только вы. Бросок для стола показывает результат всем.',
  'No tables yet.': 'Таблиц пока нет.',
  '{die}, results: {count}': '{die}, результатов: {count}',
  'Roll for the table': 'Бросить для стола',
  'Roll for the table: {name}': 'Бросить для стола: {name}',
  'Roll for me': 'Бросить для себя',
  'Roll for me: {name}': 'Бросить для себя: {name}',
  'Its results': 'Её результаты',
  'A new table': 'Новая таблица',
  'Results, one a line': 'Результаты, по одному в строке',
  'Begin each with its range: 1–2 Wolves. Lines with no numbers share the die evenly.':
    'Начинайте каждый с диапазона: 1–2 Волки. Строки без чисел делят кость поровну.',
  '1–2 Wolves': '1–2 Волки',
  '3 A pedlar with a lame mule': '3 Торговец с хромым мулом',
  '4–6 Nothing but rain': '4–6 Только дождь',
  'Save the table': 'Сохранить таблицу',
  'Write at least one result.': 'Напишите хотя бы один результат.',
  'More lines than the die has faces.': 'Строк больше, чем граней у кости.',
  'Line {line} has no range: begin it with its number, as 3 or 1–2.':
    'В строке {line} нет диапазона: начните её с числа, например 3 или 1–2.',
  'Line {line} goes past the die.': 'Строка {line} выходит за грани кости.',
  'Line {line} is too long.': 'Строка {line} слишком длинная.',
  'The ranges cover 1 to {last} once each, in order: look at {face}.':
    'Диапазоны покрывают числа от 1 до {last} по одному разу и по порядку: проверьте {face}.',
  'These lines do not share the die evenly: begin each with its range.':
    'Эти строки не делят кость поровну: начните каждую с диапазона.',
  'Your library holds as many tables as it may: delete one first.':
    'В библиотеке уже предельное число таблиц: сначала удалите одну.',
  'The table could not be saved. Try again.': 'Не удалось сохранить таблицу. Попробуйте ещё раз.',
  // A table's roll in the dice log
  'Table: {name}': 'Таблица: {name}',
});
