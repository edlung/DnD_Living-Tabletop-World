import { registerRussian } from '@ltw/ui';

/**
 * Russian for the page's side of the native apps (docs/adr/0070-native-apps.md). As on the Table
 * screen sheet, to pair is «подключить»; a TV joined by AirPlay or a cable is «соединён».
 */
registerRussian({
  'Scan the table’s code': 'Сканировать код стола',
  'Server: {host}': 'Сервер: {host}',
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
});
