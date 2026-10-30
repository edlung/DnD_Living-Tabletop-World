import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';

import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';

/** Test-only translation of the independent Bell specimen; IDs/rules remain identical. */
const translations = new Map<string, string>([
  [
    'Расследование звона затонувшего колокола с мирным решением и необязательным боем.',
    'Investigate a sunken bell, with a peaceful resolution and an optional fight.',
  ],
  [
    'Северный речной посёлок Белая Пристань зимой.',
    'The northern river settlement of White Harbor in winter.',
  ],
  [
    'Тревожная сказка, доброжелательные люди и понятные мотивы.',
    'An unsettling fairy tale with kind people and understandable motives.',
  ],
  ['Первая сессия около двух часов.', 'A first session of about two hours.'],
  ['Несколько путей к уликам', 'Several paths to each clue'],
  ['Возможность договориться', 'A chance to negotiate'],
  ['Опасность для детей', 'Children in danger'],
  ['Обязательный бой', 'Mandatory combat'],
  ['Колокол подо льдом', 'The Bell Beneath the Ice'],
  ['Белая Пристань', 'White Harbor'],
  [
    'На причале слышен далёкий звон. Арден показывает объявление Ивы: нужен журнал старого шлюза.',
    'A distant bell rings at the dock. Arden points to Iva’s notice: the old sluice journal is missing.',
  ],
  ['Белоречье', 'Whitewater'],
  ['Причал', 'The Dock'],
  ['Маяк', 'The Lighthouse'],
  ['Мастерская', 'The Workshop'],
  ['Архив', 'The Archive'],
  ['Старый шлюз', 'The Old Sluice'],
  ['Затонувшая башня', 'The Sunken Tower'],
  ['Алёна', 'Alena'],
  ['Следопыт, знакомая с зимней рекой.', 'A ranger who knows the river in winter.'],
  ['Борин', 'Borin'],
  ['Маг, изучающий старые механизмы.', 'A wizard who studies old machinery.'],
  ['Дарья', 'Darya'],
  ['Следопыт, привыкшая помогать путешественникам.', 'A ranger accustomed to helping travelers.'],
  ['Ива', 'Iva'],
  [
    'Смотрительница хочет сохранить проход по реке и исправить свою ошибку.',
    'The lighthouse keeper wants to keep the river open and correct her mistake.',
  ],
  ['Арден', 'Arden'],
  ['Перевозчик хочет безопасный путь для лодок.', 'The ferryman wants a safe passage for boats.'],
  ['Нера', 'Nera'],
  [
    'Мастер хочет исправить устройство и защитить имя наставника.',
    'The artisan wants to repair the device and protect her mentor’s reputation.',
  ],
  ['Сев', 'Sev'],
  [
    'Хранитель архива охотно помогает искать документы.',
    'The archivist gladly helps people find documents.',
  ],
  ['Следы медной пыли', 'Traces of Copper Dust'],
  ['Блестящие медные следы на досках.', 'Shining traces of copper mark the boards.'],
  ['Карта течений', 'The Current Chart'],
  [
    'На карте отмечено изменение течения выше посёлка.',
    'The chart marks a change in the current upstream of the settlement.',
  ],
  ['Копия плана шлюза', 'A Copy of the Sluice Plan'],
  ['Доступная копия технического плана.', 'A freely available copy of the engineering plan.'],
  ['Записка наставника', 'The Mentor’s Note'],
  ['Открытая копия записки лежит на верстаке.', 'An open copy of the note lies on the workbench.'],
  ['Журнал шлюза', 'The Sluice Journal'],
  ['Журнал лежит на служебной полке.', 'The journal lies on the maintenance shelf.'],
  ['Резонатор', 'The Resonator'],
  ['Медный регулятор под защитным кожухом.', 'A copper regulator beneath a protective cover.'],
  ['Ледяной краб', 'The Ice Crab'],
  [
    'Речное существо тревожится из-за вибрации.',
    'The river creature is disturbed by the vibration.',
  ],
  ['Клешня', 'Claw'],
  [
    'В Белой Пристани есть причал, маяк, архив и мастерская; здесь работают Ива, Арден, Нера и Сев.',
    'White Harbor has a dock, lighthouse, archive, and workshop. Iva, Arden, Nera, and Sev work here.',
  ],
  [
    'Объявление Ивы просит вернуть журнал старого шлюза.',
    'Iva’s notice asks for the return of the old sluice journal.',
  ],
  [
    'Ива запустила оставленный наставником резонатор; его настройка нарушена, и колокол откликается на механизм.',
    'Iva activated the resonator left by her mentor. It is out of tune, and the bell responds to its mechanism.',
  ],
  [
    'Карта показывает, что течение изменилось у старого шлюза.',
    'The chart shows that the current changed near the old sluice.',
  ],
  [
    'Я запустила резонатор, пытаясь пробить безопасную полынью.',
    'I activated the resonator to open a safe channel through the ice.',
  ],
  [
    'Говорят, Ива навлекла на реку проклятие; я этого не видел.',
    'People say Iva cursed the river. I did not see it myself.',
  ],
  [
    'В записке наставника есть способ ручной остановки регулятора.',
    'The mentor’s note explains how to shut down the regulator by hand.',
  ],
  [
    'В архиве хранится доступная копия плана старого шлюза.',
    'The archive holds an available copy of the old sluice plan.',
  ],
  [
    'Медная пыль на причале совпадает с деталями старого шлюза.',
    'The copper dust on the dock matches parts of the old sluice.',
  ],
  [
    'Копия плана показывает путь к старому шлюзу и место регулятора.',
    'The copied plan shows a route to the old sluice and the regulator’s position.',
  ],
  [
    'Записка описывает ручную остановку резонатора до его настройки.',
    'The note describes shutting down the resonator by hand before adjusting it.',
  ],
  [
    'Последняя запись связывает пробный запуск и изменение течения; журнал можно вернуть Иве.',
    'The final entry links the test activation to the changed current. The journal can be returned to Iva.',
  ],
  ['Кому доверить реку', 'Who Can Be Trusted with the River'],
  [
    'Перевозчики требуют безопасного прохода, а Ива пытается исправить свою ошибку.',
    'The ferrymen demand safe passage while Iva tries to correct her mistake.',
  ],
  [
    'Судоходство, доверие и сохранность шлюза.',
    'Safe navigation, public trust, and the survival of the sluice.',
  ],
  ['Звон на причале', 'Ringing at the Dock'],
  [
    'Арден готов поделиться слухом, а объявление Ивы предлагает понятную работу.',
    'Arden is ready to share a rumor, and Iva’s notice offers a clear task.',
  ],
  ['Вернуть журнал', 'Return the journal'],
  ['Узнать источник звона', 'Find the source of the ringing'],
  ['Расспросить Ардена', 'Ask Arden'],
  ['Осмотреть причал', 'Inspect the dock'],
  ['Пойти в архив', 'Visit the archive'],
  [
    'Партия публично обвинит Иву без доказательств',
    'The party publicly accuses Iva without evidence',
  ],
  [
    'Перевозчики могут потребовать объяснений; ведущий решает их ответ.',
    'The ferrymen may demand an explanation. The DM decides how they respond.',
  ],
  ['Просьба смотрительницы', 'The Keeper’s Request'],
  [
    'Ива показывает карту течений, но не желает сразу говорить о своём походе.',
    'Iva shows the current chart but is reluctant to discuss her expedition immediately.',
  ],
  ['Сравнить карту с рассказом Ардена', 'Compare the chart with Arden’s account'],
  ['Спокойно поговорить', 'Have a calm conversation'],
  ['Попросить показать путь к шлюзу', 'Ask for the route to the sluice'],
  ['Ива решит довериться партии', 'Iva decides to trust the party'],
  [
    'Она может признаться в пробном запуске; это ещё не произошло.',
    'She may admit to the test activation. This has not happened yet.',
  ],
  ['Копия старого плана', 'A Copy of the Old Plan'],
  [
    'Сев разрешает изучить доступную копию плана.',
    'Sev allows the party to study the available copy of the plan.',
  ],
  ['Найти альтернативный путь к шлюзу', 'Find another route to the sluice'],
  ['Попросить копию', 'Ask for a copy'],
  ['Осмотреть чертёж', 'Examine the drawing'],
  [
    'Нера оставила на открытом верстаке копию записки для тех, кто помогает с рекой.',
    'Nera left a copy of the note on her open workbench for anyone helping with the river.',
  ],
  ['Понять механизм', 'Understand the mechanism'],
  ['Показать медную деталь', 'Show the copper part'],
  ['Прочитать открытую записку', 'Read the open note'],
  ['У регулятора', 'At the Regulator'],
  [
    'Журнал лежит на служебной полке. Вибрация тревожит ледяного краба.',
    'The journal rests on a maintenance shelf. The vibration disturbs an ice crab.',
  ],
  ['Остановить устройство', 'Stop the device'],
  ['Попросить Неру помочь', 'Ask Nera for help'],
  ['Ручная остановка', 'Shut it down by hand'],
  ['Отступить', 'Withdraw'],
  ['Резонатор будет остановлен', 'The resonator is stopped'],
  [
    'Течение может успокоиться; последствие разыгрывается и записывается после решения игроков.',
    'The current may settle. This consequence is played out and recorded only after the players decide.',
  ],
  ['Потревоженный краб', 'The Disturbed Crab'],
  [
    'Ведущий может начать встречу, если партия приблизится к существу и выберет бой.',
    'The DM may begin the encounter if the party approaches the creature and chooses to fight.',
  ],
  ['Вернуть реке спокойствие', 'Restore Calm to the River'],
  ['Помочь с поиском журнала старого шлюза.', 'Help find the old sluice journal.'],
  ['Найден старый шлюз.', 'The old sluice has been found.'],
  ['Осмотрены улики у шлюза.', 'The clues at the sluice have been examined.'],
  [
    'Партия вернулась на причал после осмотра шлюза.',
    'The party returned to the dock after investigating the sluice.',
  ],
  [
    'Снежный речной посёлок, деревянные строения и мягкий зимний свет.',
    'A snowy riverside settlement, wooden buildings, and soft winter light.',
  ],
  ['Единая северная фэнтези-палитра.', 'A consistent northern fantasy palette.'],
  [
    'Тёплая дорожная одежда, естественный портрет в северном посёлке.',
    'Warm traveling clothes and a natural portrait in a northern settlement.',
  ],
  ['Единая живописная фэнтези-палитра.', 'A consistent painterly fantasy palette.'],
  [
    'Настил, механизм, ледяной берег и свободные проходы.',
    'Wooden decking, machinery, an icy bank, and clear paths.',
  ],
  ['Читаемый вид сверху без подписей.', 'A clear overhead view without labels.'],
  [
    'Свободное знакомство с причалом и просьбой Ивы.',
    'Explore the dock and learn about Iva’s request at the party’s own pace.',
  ],
  [
    'Расследование в выбранном игроками порядке: маяк, архив или мастерская.',
    'Investigate the lighthouse, archive, or workshop in the players’ chosen order.',
  ],
  [
    'Выбор у шлюза: исследование, помощь Неры, остановка или необязательный бой.',
    'Choose at the sluice: investigate, seek Nera’s help, shut down the device, or take an optional fight.',
  ],
  [
    'Возвращение или уход; последствия следуют только из реальных решений.',
    'Return or leave. Consequences follow only from actual decisions.',
  ],
  ['Экспедиция к затонувшей башне.', 'An expedition to the sunken tower.'],
  ['Спор о старых водных путях.', 'A dispute over the old waterways.'],
  ['Поиск других устройств наставника.', 'A search for the mentor’s other devices.'],
]);

function translated(value: unknown): unknown {
  if (typeof value === 'string') {
    if (!/[А-Яа-яЁё]/.test(value)) return value;
    const result = translations.get(value);
    if (result === undefined) throw new Error('BELL_ENGLISH_TRANSLATION_MISSING');
    return result;
  }
  if (Array.isArray(value)) return value.map(translated);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, translated(entry)]),
    );
  return value;
}

export function englishBellCampaign(): CampaignPackage {
  const content = campaignPackageSchema.parse(translated(bellCampaign()));
  content.world.language = 'en';
  return content;
}
