import type { CampaignEntity, CampaignPackage } from '../../packages/contracts/src/index.ts';

import type { HeroKey } from './data.ts';
import { automaton } from './sheets.ts';

const foes = [
  {
    key: 'dock-keeper-a',
    name: 'Смотритель причала',
    location: 'harbor',
    hp: 10,
    ac: 11,
    bonus: 2,
  },
  {
    key: 'dock-keeper-b',
    name: 'Помощник смотрителя',
    location: 'harbor',
    hp: 10,
    ac: 11,
    bonus: 2,
  },
  { key: 'repairer', name: 'Латунный ремонтник', location: 'forge', hp: 22, ac: 12, bonus: 3 },
  {
    key: 'repeat-guardian',
    name: 'Страж повторения',
    location: 'lighthouse',
    hp: 32,
    ac: 13,
    bonus: 3,
  },
];

export const foeEntities = (): CampaignEntity[] =>
  foes.map((foe) => ({
    key: foe.key,
    name: foe.name,
    kind: 'creature',
    description:
      'Латунный служебный автомат с мягкими упорами. Перед движением подаёт предупреждающий сигнал.',
    status: 'active',
    existsSince: null,
    placement: { location: foe.location, since: null },
    statBlock: automaton(foe.hp, foe.ac, foe.bonus),
  }));

export function encounters(party: readonly HeroKey[]): CampaignPackage['encounters'] {
  const definitions = [
    {
      key: 'dock-keepers',
      title: 'Смотрители причала',
      location: 'harbor',
      foes: ['dock-keeper-a', 'dock-keeper-b'],
      trigger:
        'Только если игроки выбрали бой после предупреждения. Мирные пути: билет на сегодня, ручной рычаг, служебный вход.',
    },
    {
      key: 'workshop-repairer',
      title: 'Ремонтник старой схемы',
      location: 'forge',
      foes: ['repairer'],
      trigger:
        'Необязательный бой при попытке автомата вернуть мост к старой форме. Можно снять шаблон, отключить питание или обойти.',
    },
    {
      key: 'last-guardian',
      title: 'Страж повторения',
      location: 'lighthouse',
      foes: ['repeat-guardian'],
      trigger:
        'Необязательная защита старого шаблона. Новая схема, ручное отключение и обход остаются доступны. Победа не выбирает финал.',
    },
  ];
  return definitions.map((encounter) => ({
    key: encounter.key,
    title: encounter.title,
    location: encounter.location,
    trigger: encounter.trigger,
    battlefield: {
      width: 10,
      height: 8,
      difficult: [
        { x: 4, y: 3 },
        { x: 4, y: 4 },
      ],
      cover: [
        { x: 6, y: 2, level: 'half' },
        { x: 6, y: 5, level: 'half' },
      ],
    },
    combatants: [
      ...party.map((entity, index) => ({
        entity,
        side: 'party' as const,
        position: { x: 1, y: index + 2 },
      })),
      ...encounter.foes.map((entity, index) => ({
        entity,
        side: 'hostile' as const,
        position: { x: 8, y: index * 3 + 2 },
      })),
    ],
  }));
}
