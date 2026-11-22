import { readFileSync } from 'node:fs';
import type { StatBlock } from '../../packages/contracts/src/index.ts';
import type { KitBoss } from './combat-kit.ts';

const SRD = JSON.parse(
  readFileSync(new URL('./srd-blocks.json', import.meta.url), 'utf8'),
) as Record<string, { cr: number; xp: number; block: StatBlock }>;

const ATTACK_RU: Record<string, string> = {
  'Abyssal Glaive': 'Глефа бездны',
  Battleaxe: 'Боевой топор',
  Beak: 'Клюв',
  Beaks: 'Клювы',
  Beard: 'Борода',
  Bite: 'Укус',
  Bites: 'Укусы',
  'Bone Bow': 'Костяной лук',
  'Bone Cudgel': 'Костяная дубина',
  Burn: 'Ожог',
  'Burning Hammer': 'Пылающий молот',
  'Charged Tendril': 'Заряженный усик',
  Claw: 'Коготь',
  Claws: 'Когти',
  Club: 'Дубинка',
  Crush: 'Сокрушение',
  Dagger: 'Кинжал',
  'Dissolving Pseudopod': 'Растворяющая ложноножка',
  'Draining Swipe': 'Иссушающий взмах',
  'Enchanting Bow': 'Чарующий лук',
  'Fiendish Touch': 'Касание исчадия',
  Fist: 'Кулак',
  'Flame Spear': 'Пламенное копьё',
  Gore: 'Бодание',
  Gouge: 'Рваный удар',
  Grab: 'Захват',
  Greataxe: 'Секира',
  Greatclub: 'Палица',
  Greatsword: 'Двуручный меч',
  'Hand Crossbow': 'Ручной арбалет',
  Handaxe: 'Топорик',
  Harpoon: 'Гарпун',
  'Heavy Crossbow': 'Тяжёлый арбалет',
  Hooves: 'Копыта',
  'Hurl Flame': 'Бросок пламени',
  'Infernal Glaive': 'Адская глефа',
  Javelin: 'Метательное копьё',
  'Life Drain': 'Вытягивание жизни',
  'Light Crossbow': 'Лёгкий арбалет',
  'Light Hammer': 'Лёгкий молот',
  Longbow: 'Длинный лук',
  Longsword: 'Длинный меч',
  Mace: 'Булава',
  Morningstar: 'Моргенштерн',
  'Necrotic Bow': 'Некротический лук',
  'Necrotic Sword': 'Некротический меч',
  'Needle Sword': 'Игольчатый меч',
  'Ocean Spear': 'Морское копьё',
  'Pact Blade': 'Клинок договора',
  'Petrifying Bite': 'Каменящий укус',
  Pike: 'Пика',
  Pincer: 'Клешня',
  Pistol: 'Пистолет',
  Proboscis: 'Хоботок',
  Pseudopod: 'Ложноножка',
  'Radiant Flame': 'Сияющее пламя',
  'Radiant Horn': 'Сияющий рог',
  Rake: 'Удар когтями',
  Ram: 'Таран',
  Rapier: 'Рапира',
  Rend: 'Разрывание',
  'Restless Touch': 'Беспокойное касание',
  'Ritual Sickle': 'Обрядовый серп',
  Rock: 'Камень',
  'Rock Launch': 'Метание камня',
  'Rotting Fist': 'Гниющий кулак',
  'Rotting Touch': 'Гниющее касание',
  Scimitar: 'Скимитар',
  Scratch: 'Царапина',
  Shock: 'Разряд',
  Shortbow: 'Короткий лук',
  Shortsword: 'Короткий меч',
  Slam: 'Удар',
  Slash: 'Рубящий удар',
  Smother: 'Удушение',
  Spear: 'Копьё',
  Sting: 'Жало',
  'Swarm of Grasping Hands': 'Рой хватающих рук',
  Tail: 'Хвост',
  'Tail Spike': 'Шип на хвосте',
  Talons: 'Когти',
  Tentacle: 'Щупальце',
  Tentacles: 'Щупальца',
  'Thorn Burst': 'Взрыв шипов',
  'Thunderous Slam': 'Громовой удар',
  Touch: 'Касание',
  'Trash Lob': 'Бросок мусора',
  'Tree Club': 'Древесная дубина',
  Tusk: 'Клык',
  'Umbral Dagger': 'Теневой кинжал',
  'Verdant Wisp': 'Зелёный огонёк',
  'Vile Slime': 'Мерзкая слизь',
  'Vine Lash': 'Удар лозой',
  'Vine Staff': 'Посох из лозы',
  Warhammer: 'Боевой молот',
  'Withering Touch': 'Иссушающее касание',
};

export function srdEntry(srd: string): { cr: number; xp: number; block: StatBlock } {
  const entry = SRD[srd];
  if (!entry) throw new Error(`Unknown or too strong SRD monster: ${srd}`);
  return entry;
}

export function statBlockFor(srd: string, boss?: KitBoss): StatBlock {
  const block = JSON.parse(JSON.stringify(srdEntry(srd).block)) as StatBlock;
  const attacks = boss?.attackIds
    ? boss.attackIds.map((id) => {
        const attack = block.attacks.find((one) => one.attackId === id);
        if (!attack) throw new Error(`Unknown attack ${srd}/${id}`);
        return attack;
      })
    : block.attacks;
  return {
    ...block,
    ...(boss?.size ? { size: boss.size } : {}),
    ...(boss?.attacksPerAction ? { attacksPerAction: boss.attacksPerAction } : {}),
    attacks: attacks.map((a) => ({ ...a, name: ATTACK_RU[a.name] ?? a.name })),
  };
}
