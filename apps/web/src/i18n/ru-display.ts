import { registerRussian } from '@ltw/ui';

/**
 * Russian for the table's screen and the table link (docs/adr/0042-table-display.md, Stage 610):
 * the TV's own page, the DM's Table screen sheet, the Players sheet's table link and the page
 * where a person chooses a free seat. The DM is «мастер», as everywhere in the client.
 */
registerRussian({
  // The TV's page
  'The table’s screen': 'Экран стола',
  'On the DM’s screen, open Table screen and type this code:':
    'У мастера откройте «Экран стола» и введите этот код:',
  'Pairing code {code}': 'Код подключения {code}',
  'The code works for ten minutes; a new one follows.':
    'Код действует десять минут, затем появится новый.',
  'Getting a code…': 'Получаем код…',
  'Too many codes were asked for. Wait a minute, then try again.':
    'Слишком много кодов подряд. Подождите минуту и попробуйте снова.',
  'The table could not be reached. Check the connection, then try again.':
    'Не удалось связаться со столом. Проверьте подключение и попробуйте снова.',
  'Opening the table’s screen…': 'Открываем экран стола…',
  'Full screen': 'Во весь экран',
  'Unpair this screen?': 'Отключить этот экран?',
  Unpair: 'Отключить',
  Keep: 'Оставить',
  'Unpair this screen': 'Отключить этот экран',
  'No fight right now': 'Сейчас боя нет',
  'The table’s rolls': 'Броски за столом',
  'The table waits for': 'Стол ждёт бросок',
  'No rolls yet.': 'Бросков пока не было.',
  'The DM': 'Мастер',
  'The Chronicle is still empty': 'Хроника пока пуста',
  'Join the table': 'Присоединиться к столу',
  'QR code to join the table': 'QR-код, чтобы присоединиться к столу',
  'Scan with your phone, sign in, and choose your character.':
    'Отсканируйте телефоном, войдите и выберите персонажа.',
  'Or open {address} and type this code.': 'Или откройте {address} и введите этот код.',
  'The DM has not opened the table to join yet.': 'Мастер ещё не открыл стол для входа.',
  'Last time': 'В прошлый раз',

  // The DM's Table screen sheet
  'Table screen': 'Экран стола',
  Screen: 'Экран',
  'Table screen (DM)': 'Экран стола (мастер)',
  'Reading the paired screens…': 'Читаем подключённые экраны…',
  'Pair a screen': 'Подключить экран',
  'On the TV, a laptop on HDMI or a stick, open {address} and type its code here.':
    'На телевизоре, ноутбуке по HDMI или приставке откройте {address} и введите здесь его код.',
  'Mirroring this iPad or laptop would show your secrets: pair a separate screen instead.':
    'Повтор экрана этого iPad или ноутбука покажет ваши секреты: подключите отдельный экран.',
  'The screen’s code': 'Код экрана',
  'Its name (optional)': 'Название (необязательно)',
  Pair: 'Подключить',
  'Type the code the screen shows.': 'Введите код, который показывает экран.',
  'The screen is paired: it shows what you choose below.':
    'Экран подключён: он показывает то, что вы выберете ниже.',
  'No screen is waiting with that code. Check it, or let the screen show a new one.':
    'Ни один экран не ждёт с таким кодом. Проверьте код или дождитесь нового.',
  'Four screens are paired already. Unpair one first.':
    'Уже подключены четыре экрана. Сначала отключите один.',
  'A code is eight letters and digits, as the screen shows it.':
    'Код — это восемь букв и цифр, как на экране.',
  'The screen could not be paired. Try again.': 'Не удалось подключить экран. Попробуйте снова.',
  'Paired screens: {count} of {limit}': 'Подключённые экраны: {count} из {limit}',
  'No screen is paired yet.': 'Пока ни один экран не подключён.',
  'Seen {when}': 'На связи: {when}',
  'Not seen yet': 'Ещё не выходил на связь',
  'Unpair: {name}': 'Отключить: {name}',
  'Unpair every screen': 'Отключить все экраны',
  'What the screens show': 'Что показывают экраны',
  'Now: {what}': 'Сейчас: {what}',
  Show: 'Показать',
  'A place’s scene': 'Сцену места',
  'The battlefield': 'Поле боя',
  'A title card': 'Титр',
  'The Chronicle’s newest chapter': 'Новую главу хроники',
  'A picture': 'Картинку',
  'The QR code to join, with “last time”': 'QR-код для входа и «в прошлый раз»',
  'Nothing (a dark screen)': 'Ничего (тёмный экран)',
  Place: 'Место',
  'Where the party is': 'Где сейчас отряд',
  Zoom: 'Масштаб',
  'Keep in view': 'Держать в кадре',
  'Whoever acts': 'Того, чей ход',
  Title: 'Название',
  'Below it (optional)': 'Под ним (необязательно)',
  'Whose picture': 'Чья картинка',
  'Choose…': 'Выберите…',
  'A screen shows only an approved picture the party knows.':
    'Экран покажет только одобренную картинку того, что знает отряд.',
  'Open the table link on the Players sheet: its QR code shows here.':
    'Откройте ссылку стола на листе «Игроки»: здесь появится её QR-код.',
  'Write the title first.': 'Сначала напишите заголовок.',
  'Choose the picture first.': 'Сначала выберите картинку.',
  'The screens could not be told. Try again.': 'Не удалось передать экранам. Попробуйте снова.',
  'Show on the screens': 'Показать на экранах',

  // The table link
  'Table link: every free seat': 'Ссылка стола: все свободные места',
  'One QR code for the whole table: each person scans it, signs in or makes a login, and takes a character nobody plays.':
    'Один QR-код на весь стол: каждый сканирует его, входит или создаёт логин и выбирает свободного персонажа.',
  'Table link': 'Ссылка стола',
  'The table’s join link': 'Ссылка для входа за стол',
  'Show it at the table only: anyone who scans it can take a free seat. Code: {code}':
    'Показывайте только за столом: любой, кто её отсканирует, займёт свободное место. Код: {code}',
  'QR code of the table link': 'QR-код ссылки стола',
  'Copied.': 'Скопировано.',
  'Open until {when}.': 'Открыта до {when}.',
  'Seat taken': 'Место занято',
  'Choosing a login…': 'Выбирает логин…',
  'Close the table link': 'Закрыть ссылку стола',
  'Open for': 'Открыть на',
  '{count} hours': '{count} ч',
  'Open the table link': 'Открыть ссылку стола',
  'The table link could not be changed. Try again.':
    'Не удалось изменить ссылку стола. Попробуйте снова.',

  // Choosing a free seat
  'The table': 'Стол',
  'Type the code the table’s screen or the DM shows.': 'Введите код с экрана стола или от мастера.',
  'Table code': 'Код стола',
  'Find the table': 'Найти стол',
  'A table code is eight letters and digits, as the screen shows it.':
    'Код стола — это восемь букв и цифр, как на экране.',
  'Reading the table…': 'Читаем стол…',
  'Too many tries. Wait a minute, then try again.':
    'Слишком много попыток. Подождите минуту и попробуйте снова.',
  'This table link is closed or its code is wrong. Ask the DM.':
    'Ссылка стола закрыта или код неверен. Спросите мастера.',
  'Choose your character': 'Выберите персонажа',
  'Every seat at this table is taken. Ask the DM.':
    'Все места за этим столом заняты. Спросите мастера.',
  'Play {name}': 'Играть: {name}',
  'Someone took {name} a moment ago. Choose another character.':
    '{name}: этого персонажа только что заняли. Выберите другого.',
});
