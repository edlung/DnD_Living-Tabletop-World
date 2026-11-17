import { registerRussian } from '@ltw/ui';

/**
 * Russian for client error reports (docs/adr/0073-table-ideas.md §1): the screen a person sees
 * when a page breaks, and the DM's card of what this table's screens reported.
 */
registerRussian({
  // When a page breaks
  'Something went wrong': 'Что-то пошло не так',
  'This page stopped working. The game itself is safe: the story is kept on the server.':
    'Эта страница перестала работать. С самой игрой всё в порядке: история хранится на сервере.',
  'This screen will load itself again in a moment.': 'Этот экран скоро сам загрузится заново.',
  'Load the page again': 'Загрузить страницу заново',
  'Load the game again': 'Загрузить игру заново',
  'Something went wrong on this screen. The game itself is safe.':
    'На этом экране что-то пошло не так. С самой игрой всё в порядке.',
  'If that does not help, tell your DM.': 'Если не поможет, скажите мастеру.',
  'The game tries to send its own server a short note: which screen, which browser and what kind of error. Never your name or your words.':
    'Игра пробует отправить на свой сервер короткую заметку: какой экран, какой браузер и что за ошибка. Вашего имени и ваших слов в ней нет.',
  // The privacy notice
  'When a page breaks: which screen it was, which browser and what kind of error — not your name, your login or anything you wrote. The DM of your table and the server’s operator read these notes to mend the game; each is removed thirty days after the error last happened.':
    'Когда страница ломается: какой это был экран, какой браузер и что за ошибка — без вашего имени, логина и того, что вы писали. Эти заметки читают мастер вашего стола и оператор сервера, чтобы починить игру; каждая удаляется через тридцать дней после того, как ошибка случилась в последний раз.',
  // The DM's notice and list
  'Screens with an error': 'Экраны с ошибкой',
  'Something went wrong on a screen at this table.':
    'На одном из экранов за столом случилась ошибка.',
  'What broke': 'Что сломалось',
  'Not now': 'Не сейчас',
  'Something went wrong on a screen at this table. Loading the page again there usually helps.':
    'На одном из экранов за столом случилась ошибка. Обычно помогает загрузить там страницу заново.',
  'Errors on this table’s screens: {count}. Loading the page again there usually helps.':
    'Ошибок на экранах за столом: {count}. Обычно помогает загрузить там страницу заново.',
  'Clear the list': 'Очистить список',
  'Clearing…': 'Очищаю…',
  'The list is cleared.': 'Список очищен.',
  'The list could not be cleared. Try again.': 'Не удалось очистить список. Попробуйте ещё раз.',
  'Where: {where}': 'Где: {where}',
  'Times: {count}': 'Сколько раз: {count}',
  'Last: {time}': 'Последний раз: {time}',
  'Not shown here: {count} more.': 'Ещё не показано: {count}.',
  'For whoever looks after the server': 'Для того, кто следит за сервером',
  'A note holds the screen, the browser and the kind of error — never a name or anyone’s words.':
    'В заметке — экран, браузер и вид ошибки; имён и чьих-либо слов в ней нет.',
  // Whose screen
  'A player’s screen': 'Экран игрока',
  'Your screen': 'Ваш экран',
  'The table’s display': 'Экран стола',
  // The browser and the device (a browser's name is its own in every language)
  Chrome: 'Chrome',
  Safari: 'Safari',
  Firefox: 'Firefox',
  Edge: 'Edge',
  Opera: 'Opera',
  'Samsung Internet': 'Samsung Internet',
  'Another browser': 'Другой браузер',
  'an iPhone or iPad': 'iPhone или iPad',
  'an Android device': 'устройство Android',
  'a Windows computer': 'компьютер с Windows',
  'a Mac': 'Mac',
  'a Linux computer': 'компьютер с Linux',
  'a Chromebook': 'Chromebook',
  'another device': 'другое устройство',
  '{browser} on {device}': '{browser}, {device}',
  '{device}, in the app': '{device}, в приложении',
  // Where
  'The game': 'Игра',
  'Signing in': 'Вход',
  'The workshop': 'Мастерская',
  // What kind
  'The screen could not be shown': 'Экран не удалось показать',
  'An error in the page': 'Ошибка на странице',
  'An action did not finish': 'Действие не завершилось',
});
