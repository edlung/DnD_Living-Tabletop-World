import { RAVENFORD_RU_FIXTURES_DIR } from '../../world-engine/ravenford-seed.ts';
import { NEVER_FOR_PLAYERS } from './secrets.ts';
import type { ScenarioScript } from './script.ts';

/**
 * What the player must never receive, in Russian: the same secrets as `NEVER_FOR_PLAYERS`,
 * as the Russian seed words them. IDs and Gate 04's planted markers carry over unchanged.
 */
const RUSSIAN_SECRETS: readonly string[] = [
  'Пепельн',
  'редкие алхимические реагенты',
  'подделали после нападения',
  'расставлены так, чтобы указывать на нападение гоблинов',
  'не просто гоблины',
  'метка Пепельного круга',
  'Раскрывать связь знака',
  'версия отряда неверна',
  'необычных заказах реагентов',
  'Орин лично знаком с капитаном Торном',
  'не вернулся с докладом',
];

export const RU_SCRIPT: ScenarioScript = {
  language: 'ru',
  fixturesDir: RAVENFORD_RU_FIXTURES_DIR,
  talkLine: 'Доброе утро!',
  hypothesis: 'Кто-то хотел, чтобы нападение выглядело делом гоблинов.',
  tomasRequest: 'Добавь: молодой стражник у Северных ворот, который видел, как ушёл караван.',
  tomasEdited: 'Молодой стражник Равенфордской стражи, двадцати двух лет.',
  tomasRefined:
    'Молодой стражник Равенфордской стражи, двадцати двух лет, зоркий на ночном дежурстве.',
  chapterTitle: 'Глава I — Тени на Торговой дороге',
  battleQuery: 'бой',
  battlePrefix: 'Бой.',
  // The English secrets still apply: an English phrase must not appear in a Russian session either.
  neverForPlayers: [
    ...NEVER_FOR_PLAYERS.filter((marker) => marker !== 'Ashen'),
    ...RUSSIAN_SECRETS,
  ],
};
