import { registerRussian } from '@ltw/ui';

/**
 * Russian for Stage 330 part B: the DM's image controls, figures and battle maps
 * (docs/STAGE_330_DESIGN.md "DM controls"). Keys are the English source strings.
 */
registerRussian({
  // The dock and the Images sheet
  Images: 'Изображения',
  'Images (DM)': 'Изображения (мастер)',
  'Pictures reach players only after you approve them. Requests and candidates are yours alone.':
    'Изображения попадают к игрокам только после вашего одобрения. Запросы и кандидаты видите только вы.',
  'Nothing is waiting for you: no candidates and no requests in progress.':
    'Ничего не ждёт вашего решения: нет кандидатов и запросов в работе.',
  '{what} of {name}': '{what} — {name}',
  'Show {name}': 'Показать: {name}',
  'Reading the pictures…': 'Читаем изображения…',

  // An entity's images in its panel
  Approved: 'Одобрены',
  'No picture is approved yet: players see the neutral fallback.':
    'Ни одно изображение пока не одобрено: игроки видят нейтральную замену.',
  'Waiting for your approval': 'Ждут вашего одобрения',
  'Only you see these until you approve one.': 'Пока вы их не одобрите, их видите только вы.',
  Requests: 'Запросы',

  // What a picture is
  'Main picture': 'Основное изображение',
  'Figure for the battlefield': 'Фигурка для поля боя',
  'Battle map': 'Карта боя',
  'Variant: {label}': 'Вариант: {label}',
  'At night': 'Ночью',
  'At dawn': 'На рассвете',
  'At dusk': 'В сумерках',
  'In the rain': 'Под дождём',
  'In a storm': 'В грозу',
  'In fog': 'В тумане',
  'In snow': 'В снегопад',
  'Under an overcast sky': 'Под пасмурным небом',
  'At night in the rain': 'Ночью под дождём',
  Wounded: 'Раненый',
  Unconscious: 'Без сознания',
  Dead: 'Мёртвый',
  Destroyed: 'Разрушенный',

  // Cards
  'The picture cannot be shown.': 'Изображение не удаётся показать.',
  'Version {version} · {maker}': 'Версия {version} · {maker}',
  'Curated set': 'Подобранный набор',
  'OpenAI image model': 'Модель изображений OpenAI',
  'Placeholder generator (tests and offline use)':
    'Генератор-заглушка (для тестов и работы без сети)',
  'Your note to the image model: {note}': 'Ваша заметка для модели изображений: {note}',
  'Approving it replaces the main picture; every later variant keeps its look.':
    'Одобрение заменит основное изображение; новые варианты будут сохранять его облик.',
  Approve: 'Одобрить',
  'Approve: {subject}': 'Одобрить: {subject}',
  'Approved: {subject}. Players who can see it now see this picture.':
    'Одобрено: {subject}. Игроки, которым это видно, теперь видят это изображение.',
  Discard: 'Отклонить',
  'Discard: {subject}': 'Отклонить: {subject}',
  'Discarded: {subject}. No one will see this picture.':
    'Отклонено: {subject}. Это изображение никто не увидит.',
  'Generate again': 'Создать заново',
  'Generate again: {subject}': 'Создать заново: {subject}',
  'Requested again: {subject}. This candidate stays until you decide.':
    'Запрошено заново: {subject}. Этот кандидат останется, пока вы не решите.',
  'Shown to players who can see it': 'Показывается игрокам, которым это видно',
  'Only you see this': 'Видите только вы',
  Replace: 'Заменить',
  'Replace: {subject}': 'Заменить: {subject}',

  // Requests without a picture yet
  'Waiting for the image generator': 'Ждёт генератора изображений',
  'Being generated': 'Создаётся',
  'Failed: {reason}': 'Не удалось: {reason}',
  'The image model refused this request.': 'Модель изображений отказалась выполнить этот запрос.',
  'The image model did not answer in time.': 'Модель изображений не ответила вовремя.',
  'The image service failed.': 'Сервис изображений дал сбой.',
  'No picture could be made: no image budget is available, or there is nothing to work from.':
    'Изображение не создано: бюджет на изображения недоступен или нет исходного изображения.',
  'Try again: {subject}': 'Повторить: {subject}',
  'Requested again: {subject}.': 'Запрошено заново: {subject}.',

  // A new request
  'Request a picture': 'Запросить изображение',
  'Replacing: {what}. The current picture stays until you approve a new one.':
    'Замена: {what}. Текущее изображение останется, пока вы не одобрите новое.',
  'What to make': 'Что создать',
  'The main picture': 'Основное изображение',
  'Variants, figures and battle maps keep the look of the approved main picture.':
    'Варианты, фигурки и карты боя сохраняют облик одобренного основного изображения.',
  'A variant for a state': 'Вариант для состояния',
  'A figure for the battlefield': 'Фигурка для поля боя',
  'A battle map seen from above': 'Карта боя (вид сверху)',
  'Variants, figures and battle maps keep the look of the main picture: approve a main picture first.':
    'Варианты, фигурки и карты боя сохраняют облик основного изображения: сначала одобрите основное изображение.',
  'For which state': 'Для какого состояния',
  'Note to the image model (optional)': 'Заметка для модели изображений (необязательно)',
  'Sent to the image model with what the world records about it. Players never see it; leave out what the model should not read.':
    'Отправляется модели изображений вместе с тем, что о нём записано в мире. Игроки её не видят; не пишите того, что модели читать не следует.',
  'Request picture': 'Запросить изображение',
  'Requested: {what}. The candidate will appear here for your approval.':
    'Запрошено: {what}. Кандидат появится здесь для вашего одобрения.',

  // The result of a command
  'Sending…': 'Отправляем…',
  'This picture changed meanwhile; the list now shows it as it is.':
    'Это изображение тем временем изменилось; список показывает его текущее состояние.',
  'The answer was interrupted. The change may have been made. Retry to check it.':
    'Ответ прервался. Изменение могло быть внесено. Повторите, чтобы проверить.',
  'Retry the change': 'Повторить изменение',
});
