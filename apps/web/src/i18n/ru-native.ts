import { registerRussian } from '@ltw/ui';

/**
 * Russian for the page's side of the native apps (docs/adr/0070-native-apps.md). As on the Table
 * screen sheet, to pair is «подключить»; a TV joined by AirPlay or a cable is «соединён».
 */
registerRussian({
  'Scan the table’s code': 'Сканировать код стола',
  'Server: {host}': 'Сервер: {host}',
  'To the game': 'К игре',
  'Only this app': 'Только это приложение',
  'No login: you come back only in this app on this device, for up to {days} days.':
    'Без логина: вернуться можно только в этом приложении на этом устройстве, до {days} дней.',
  // What the browser's pages say of "this browser", said of the app.
  'This app is already signed in to a table.': 'В этом приложении уже выполнен вход.',
  'Replacing signs this app out of that table. Keeping it leaves the invitation unused: it still works once, on another device.':
    'При замене это приложение выйдет из-за того стола. Если оставить текущий вход, приглашение останется неиспользованным и сработает один раз на другом устройстве.',
  'An invitation link works once. A seat taken without a login stays in this app on this device for up to {days} days.':
    'Ссылка-приглашение срабатывает один раз. Место без логина хранится в этом приложении на этом устройстве до {days} дней.',
  'Your login signs out of this app too. Sign in with it to come back.':
    'Логин тоже выйдет из этого приложения. Чтобы вернуться, войдите по нему.',
  'This app already has a workshop open. Your game session stays separate.':
    'В этом приложении уже открыта мастерская. Вход в игру остаётся отдельным.',
  'Enter through a normal invitation. This app asks before replacing another game sign-in.':
    'Войдите через обычное приглашение. Приложение спросит подтверждение перед заменой входа в другую игру.',
  'The microphone is not allowed: you listen only. Allow it for this app in the device’s settings, then join again.':
    'Микрофон не разрешён: вы только слушаете. Разрешите его этому приложению в настройках устройства и войдите снова.',
  // LTW DM's own TV (§6)
  'The TV of this device': 'Телевизор этого устройства',
  'Pair this TV': 'Подключить этот телевизор',
  'Connect a TV by AirPlay (Screen Mirroring) or a cable: this app shows the table’s screen there, never your own.':
    'Соедините телевизор через AirPlay («Повтор экрана») или кабелем: приложение покажет там экран стола, а не ваш.',
  'A TV is connected: the table’s screen is starting on it…':
    'Телевизор соединён: на нём открывается экран стола…',
  'The TV connected to this device shows this code. Pair it to show what you choose below.':
    'Телевизор, соединённый с этим устройством, показывает этот код. Подключите его, чтобы показывать то, что вы выберете ниже.',
  'The TV connected to this device is paired: it shows what you choose below.':
    'Телевизор этого устройства подключён: он показывает то, что вы выберете ниже.',
  'When this app leaves the screen, the TV mirrors this device again: the app covers its own page first.':
    'Когда приложение уходит с экрана, телевизор снова повторяет экран устройства; свою страницу приложение перед этим закрывает.',
  'The TV of this device still shows another campaign.':
    'Телевизор этого устройства всё ещё показывает другую кампанию.',
  'Show this campaign on the TV': 'Показать эту кампанию на телевизоре',
  'Sound on the TV: ambience, music and the dice': 'Звук на телевизоре: фон, музыка и кубики',
  'Volume on the TV': 'Громкость на телевизоре',
});
