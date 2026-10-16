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
  // What an approval did, read from the lineage after it
  'Approved: {subject}. Players who can see {name} now see this picture.':
    'Одобрено: {subject}. Теперь это изображение видят игроки, которые видят «{name}».',
  'Approved: {subject}. Players who can see {name} now see this picture, except in a state with its own approved picture.':
    'Одобрено: {subject}. Теперь это изображение видят игроки, которые видят «{name}», кроме состояний со своим одобренным изображением.',
  'Approved: {subject}. Players who can see {name} see this map under the grid of a fight there.':
    'Одобрено: {subject}. Игроки, которые видят «{name}», видят эту карту под сеткой боя в этом месте.',
  'Approved: {subject}. Shown to players who can see {name} {when}.':
    'Одобрено: {subject}. Показывается игрокам, которые видят «{name}», {when}.',
  'Approved: {subject}. Shown to players who can see {name} {when}, unless another approved state picture fits better.':
    'Одобрено: {subject}. Показывается игрокам, которые видят «{name}», {when}, если лучше не подходит другое одобренное изображение состояния.',
  'Approved: {subject}. It is not the picture players see now; the list shows the one they see.':
    'Одобрено: {subject}. Сейчас игроки видят не его; список показывает то, что они видят.',
  'Approved: {subject}. Only you see it: it was asked for the DM alone.':
    'Одобрено: {subject}. Его видите только вы: оно запрошено только для мастера.',
  'at night': 'ночью',
  'at dawn': 'на рассвете',
  'at dusk': 'в сумерках',
  'in the rain': 'в дождь',
  'in a storm': 'в грозу',
  'in fog': 'в тумане',
  'in snow': 'в снегопад',
  'under an overcast sky': 'под пасмурным небом',
  'at night in the rain': 'ночью под дождём',
  'while wounded': 'при ранении',
  'while unconscious': 'без сознания',
  'once dead': 'после гибели',
  'once destroyed': 'после разрушения',
  'when its state is “{label}”': 'в состоянии «{label}»',
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
  'Requested: {what}. The candidate will appear for your approval.':
    'Запрошено: {what}. Кандидат появится для вашего одобрения.',

  // The command and its result, where it was given and wherever it holds the controls
  'Request: {subject}': 'Запрос: {subject}',
  'Sending “{subject}”…': 'Отправляем «{subject}»…',
  'Reading the result of “{subject}”…': 'Читаем результат «{subject}»…',
  'This picture changed meanwhile; the list now shows it as it is.':
    'Это изображение тем временем изменилось; список показывает его текущее состояние.',
  'The answer to “{subject}” was interrupted. The change may have been made. Retry to check it.':
    'Ответ на «{subject}» прервался. Изменение могло быть внесено. Повторите, чтобы проверить.',
  'Retry the change': 'Повторить изменение',
  'Retry the change: {subject}': 'Повторить изменение: {subject}',
});
