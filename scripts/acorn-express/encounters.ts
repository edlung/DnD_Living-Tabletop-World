import type { CampaignEntity, CampaignPackage } from '../../packages/contracts/src/index.ts';
import type { HeroKey } from './data.ts';
import { automaton } from './sheets.ts';

export const foeKeys = [
  'porter-a',
  'porter-b',
  'gardener-a',
  'gardener-b',
  'gardener-c',
  'repair-a',
  'repair-b',
];
export const foeEntities = (): CampaignEntity[] =>
  foeKeys.map((key, index) => ({
    key,
    name: index < 2 ? 'Багажный садовник' : index < 5 ? 'Садовник оранжереи' : 'Ремонтный садовник',
    kind: 'creature',
    description:
      'Небольшой служебный автомат из дерева и меди, с мягкими захватами и ростком на голове. Перед действием подаёт сигнал.',
    status: 'active',
    existsSince: null,
    placement: { location: index < 2 ? 'station' : index < 5 ? 'glass' : 'storm', since: null },
    statBlock: automaton(index < 2 ? 10 : 14, index < 2 ? 11 : 12, index < 2 ? 2 : 3),
  }));

export function encounters(party: readonly HeroKey[]): CampaignPackage['encounters'] {
  const definitions = [
    {
      key: 'baggage-gardeners',
      title: 'Садовники багажа',
      location: 'station',
      foes: foeKeys.slice(0, 2),
      width: 12,
      height: 8,
      difficult: [
        { x: 5, y: 3 },
        { x: 5, y: 4 },
      ],
      cover: [
        { x: 7, y: 2, level: 'half' as const },
        { x: 7, y: 5, level: 'half' as const },
      ],
      trigger:
        'Только если игроки выбрали бой. Марфа, ручной пропуск и помощь с грузом позволяют пройти мирно.',
    },
    {
      key: 'glass-gardeners',
      title: 'Запутанный распорядок',
      location: 'glass',
      foes: foeKeys.slice(2, 5),
      width: 10,
      height: 10,
      difficult: [
        { x: 4, y: 3 },
        { x: 4, y: 4 },
        { x: 4, y: 5 },
      ],
      cover: [
        { x: 6, y: 2, level: 'half' as const },
        { x: 6, y: 6, level: 'half' as const },
      ],
      trigger:
        'Необязательная встреча. Приглашение Ивы, рабочий жетон, открытый проход или отключение автоматов сохраняют мирный путь.',
    },
    {
      key: 'bridge-repairers',
      title: 'Инструменты в чужих руках',
      location: 'storm',
      foes: foeKeys.slice(5),
      width: 12,
      height: 8,
      difficult: [
        { x: 5, y: 2 },
        { x: 5, y: 5 },
      ],
      cover: [
        { x: 7, y: 3, level: 'half' as const },
        { x: 7, y: 4, level: 'half' as const },
      ],
      trigger:
        'Только по выбору группы. Машины не сталкивают людей с моста. Жетон мастера, помощь Вельта или отключение на стоянке решают конфликт.',
    },
  ];
  return definitions.map((e) => ({
    key: e.key,
    title: e.title,
    location: e.location,
    trigger: e.trigger,
    battlefield: { width: e.width, height: e.height, difficult: e.difficult, cover: e.cover },
    combatants: [
      ...party.map((entity, index) => ({
        entity,
        side: 'party' as const,
        position: { x: 1, y: index + 2 },
      })),
      ...e.foes.map((entity, index) => ({
        entity,
        side: 'hostile' as const,
        position: { x: e.width - 2, y: index * 2 + 2 },
      })),
    ],
  }));
}
