import { readFileSync } from 'node:fs';

import type {
  CampaignEntity,
  CampaignPackage,
  StatBlock,
} from '../../packages/contracts/src/index.ts';

/**
 * Fights for campaigns rewritten to the distinctness map (`campaigns/distinctness/`): SRD monster
 * numbers under a campaign's own names, and a battlefield of its own for every encounter.
 */
type Built = CampaignPackage['encounters'][number];
type Side = 'W' | 'E' | 'N' | 'S';
type Family =
  | 'open'
  | 'corridor'
  | 'bridge'
  | 'ring'
  | 'rows'
  | 'hall'
  | 'stair'
  | 'deck'
  | 'maze'
  | 'chasm'
  | 'patches'
  | 'roofs';
interface Square {
  x: number;
  y: number;
}
interface Cover extends Square {
  level: 'half' | 'three-quarters';
}
export interface KitFoe {
  srd: string;
  name: string;
  description: string;
  count: number;
}
export type KitBoss = Omit<KitFoe, 'count'>;
export interface KitEncounter {
  key: string;
  title: string;
  location: string;
  trigger: string;
  objective: string;
  tactics: string;
  peaceful?: string;
  layout?: string;
  foes?: KitFoe[];
  boss?: KitBoss;
}

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

/** terrain key: [family, width, height, party side, foe side] */
const TERRAIN: Record<string, [Family, number, number, Side, Side]> = {
  'forest-clearing': ['open', 16, 12, 'W', 'E'],
  'village-square': ['open', 14, 12, 'S', 'N'],
  'court-square': ['open', 14, 10, 'S', 'N'],
  'school-yard': ['open', 14, 12, 'W', 'E'],
  crater: ['open', 14, 14, 'S', 'N'],
  quarry: ['open', 16, 12, 'E', 'W'],
  'canyon-station': ['open', 16, 10, 'W', 'E'],
  'hotel-corridor': ['corridor', 20, 5, 'W', 'E'],
  'trap-corridor': ['corridor', 20, 6, 'E', 'W'],
  tunnel: ['corridor', 22, 5, 'W', 'E'],
  'elevator-shaft': ['corridor', 6, 16, 'S', 'N'],
  stairwell: ['stair', 8, 14, 'S', 'N'],
  'cell-block': ['corridor', 18, 7, 'W', 'E'],
  airlock: ['corridor', 12, 6, 'W', 'E'],
  'train-car': ['corridor', 20, 5, 'E', 'W'],
  'machine-leg': ['corridor', 6, 18, 'S', 'N'],
  bridge: ['bridge', 24, 6, 'W', 'E'],
  'moving-truck': ['bridge', 14, 5, 'W', 'E'],
  ridge: ['bridge', 22, 6, 'E', 'W'],
  'island-edge': ['bridge', 20, 7, 'W', 'E'],
  pier: ['bridge', 20, 6, 'E', 'W'],
  conveyor: ['bridge', 22, 5, 'W', 'E'],
  'city-wall': ['bridge', 22, 5, 'E', 'W'],
  'boxing-ring': ['ring', 8, 8, 'W', 'E'],
  arena: ['ring', 12, 12, 'S', 'N'],
  'warehouse-crates': ['rows', 18, 12, 'W', 'E'],
  market: ['rows', 16, 12, 'S', 'N'],
  'library-stacks': ['rows', 16, 12, 'W', 'E'],
  'print-shop': ['rows', 14, 10, 'E', 'W'],
  workshop: ['rows', 14, 10, 'W', 'E'],
  granary: ['rows', 14, 10, 'S', 'N'],
  'counting-house': ['rows', 14, 10, 'W', 'E'],
  kitchen: ['rows', 12, 10, 'E', 'W'],
  'locker-room': ['rows', 12, 8, 'W', 'E'],
  gallery: ['rows', 18, 10, 'E', 'W'],
  ward: ['rows', 16, 10, 'W', 'E'],
  'hospital-ward': ['rows', 18, 8, 'E', 'W'],
  caravanserai: ['rows', 14, 12, 'S', 'N'],
  safehouse: ['rows', 12, 8, 'W', 'E'],
  'great-hall': ['hall', 16, 12, 'S', 'N'],
  ballroom: ['hall', 18, 12, 'W', 'E'],
  'casino-floor': ['hall', 18, 12, 'E', 'W'],
  'switchboard-hall': ['hall', 16, 10, 'W', 'E'],
  'palace-gallery': ['hall', 20, 10, 'W', 'E'],
  'frame-hall': ['hall', 14, 12, 'S', 'N'],
  'dungeon-hall': ['hall', 14, 12, 'N', 'S'],
  shrine: ['hall', 12, 12, 'S', 'N'],
  crypt: ['hall', 14, 10, 'W', 'E'],
  'factory-floor': ['hall', 18, 12, 'W', 'E'],
  forge: ['hall', 16, 12, 'S', 'N'],
  'film-set': ['hall', 16, 12, 'E', 'W'],
  stage: ['hall', 14, 10, 'S', 'N'],
  backstage: ['rows', 12, 10, 'W', 'E'],
  'courthouse-steps': ['stair', 14, 8, 'S', 'N'],
  'tower-spiral': ['stair', 10, 16, 'S', 'N'],
  'mountain-pass': ['stair', 12, 18, 'S', 'N'],
  'temple-roof': ['stair', 14, 10, 'W', 'E'],
  'ship-deck': ['deck', 18, 8, 'W', 'E'],
  'sky-deck': ['deck', 18, 8, 'E', 'W'],
  'storm-terrace': ['deck', 14, 10, 'S', 'N'],
  'garden-maze': ['maze', 16, 14, 'W', 'E'],
  orchard: ['maze', 16, 12, 'S', 'N'],
  backlot: ['maze', 16, 12, 'W', 'E'],
  'street-corner': ['maze', 14, 12, 'E', 'W'],
  'barricade-street': ['maze', 16, 10, 'W', 'E'],
  'rail-yard': ['maze', 20, 12, 'E', 'W'],
  'factory-gate': ['maze', 16, 10, 'S', 'N'],
  gate: ['maze', 16, 12, 'S', 'N'],
  'canal-dock': ['maze', 18, 10, 'W', 'E'],
  dock: ['maze', 18, 10, 'E', 'W'],
  mill: ['maze', 14, 10, 'W', 'E'],
  chasm: ['chasm', 18, 12, 'W', 'E'],
  'river-bank': ['chasm', 18, 12, 'E', 'W'],
  'lake-shore': ['chasm', 16, 12, 'W', 'E'],
  reef: ['chasm', 18, 12, 'S', 'N'],
  'open-water': ['patches', 18, 14, 'W', 'E'],
  'ice-field': ['patches', 18, 14, 'W', 'E'],
  'lava-flow': ['patches', 18, 14, 'S', 'N'],
  'desert-dunes': ['patches', 18, 14, 'E', 'W'],
  'bone-cavern': ['patches', 16, 14, 'N', 'S'],
  'cave-narrow': ['patches', 18, 8, 'W', 'E'],
  necropolis: ['patches', 16, 12, 'S', 'N'],
  'paper-reef': ['patches', 16, 12, 'W', 'E'],
  rooftops: ['roofs', 20, 12, 'W', 'E'],
};

export const LAYOUT_KEYS = Object.keys(TERRAIN);

export function isKit(e: { foes?: unknown }): boolean {
  return Array.isArray(e.foes);
}

export function srdEntry(srd: string): { cr: number; xp: number; block: StatBlock } {
  const entry = SRD[srd];
  if (!entry) throw new Error(`Unknown or too strong SRD monster: ${srd}`);
  return entry;
}

function statBlockFor(srd: string): StatBlock {
  const block = JSON.parse(JSON.stringify(srdEntry(srd).block)) as StatBlock;
  return {
    ...block,
    attacks: block.attacks.map((a) => ({ ...a, name: ATTACK_RU[a.name] ?? a.name })),
  };
}

function random(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Layout {
  width: number;
  height: number;
  difficult: Square[];
  cover: Cover[];
  partySide: Side;
  foeSide: Side;
}

/** A battlefield of its own: the terrain sets the shape, the encounter key varies the details. */
export function layoutFor(terrain: string, seedKey: string): Layout {
  const spec = TERRAIN[terrain];
  if (!spec) throw new Error(`Unknown battlefield layout: ${terrain}`);
  const [family, width, height, partySide, foeSide] = spec;
  const r = random(`${terrain}:${seedKey}`);
  const pick = (low: number, high: number) => low + Math.floor(r() * (high - low + 1));
  const horizontal = partySide === 'W' || partySide === 'E';
  // The two starting bands stay clear so a party of eight and its foes always fit.
  const clear = (x: number, y: number) =>
    horizontal ? x < 3 || x > width - 4 : y < 3 || y > height - 4;
  const difficult = new Map<string, Square>();
  const cover = new Map<string, Cover>();
  const rough = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height || clear(x, y)) return;
    if (!cover.has(`${x},${y}`)) difficult.set(`${x},${y}`, { x, y });
  };
  const block = (x: number, y: number, level: Cover['level'] = 'half') => {
    if (x < 0 || y < 0 || x >= width || y >= height || clear(x, y)) return;
    difficult.delete(`${x},${y}`);
    cover.set(`${x},${y}`, { x, y, level });
  };
  const blob = (cx: number, cy: number, radius: number) => {
    for (let y = cy - radius; y <= cy + radius; y++)
      for (let x = cx - radius; x <= cx + radius; x++)
        if (Math.abs(x - cx) + Math.abs(y - cy) <= radius + (r() < 0.4 ? 1 : 0)) rough(x, y);
  };
  const span = horizontal ? width : height;
  const across = horizontal ? height : width;
  const at = (along: number, side: number): [number, number] =>
    horizontal ? [along, side] : [side, along];

  switch (family) {
    case 'open': {
      for (let i = Math.round((width * height) / 26); i > 0; i--)
        block(pick(3, width - 4), pick(1, height - 2));
      for (let i = pick(2, 3); i > 0; i--)
        blob(pick(4, width - 5), pick(2, height - 3), pick(1, 2));
      break;
    }
    case 'corridor': {
      for (let a = 4 + pick(0, 1), side = 0; a < span - 3; a += pick(3, 5), side++)
        block(...at(a, side % 2 === 0 ? 0 : across - 1), 'three-quarters');
      const middle = Math.floor(span / 2);
      for (let i = pick(2, 4); i > 0; i--) rough(...at(middle + pick(-2, 2), pick(1, across - 2)));
      break;
    }
    case 'bridge': {
      for (let a = 3; a < span - 3; a++) {
        rough(...at(a, 0));
        rough(...at(a, across - 1));
      }
      for (let a = 5 + pick(0, 2); a < span - 4; a += pick(4, 6))
        block(...at(a, r() < 0.5 ? 1 : across - 2));
      const gap = Math.floor(span / 2) + pick(-2, 2);
      for (let s = 1; s < across - 1; s += 1) if (r() < 0.6) rough(...at(gap, s));
      break;
    }
    case 'ring': {
      // The ropes hold no one back; the corners are the only thing to put a back against.
      if (width >= 12) {
        block(4, 4, 'three-quarters');
        block(width - 5, height - 5, 'three-quarters');
      }
      break;
    }
    case 'rows': {
      for (let a = 3 + pick(0, 1); a < span - 3; a += pick(3, 4)) {
        const gapA = pick(0, across - 1);
        const gapB = pick(0, across - 1);
        for (let s = 1; s < across - 1; s++) if (s !== gapA && s !== gapB) block(...at(a, s));
      }
      break;
    }
    case 'hall': {
      for (let a = 4; a < span - 3; a += pick(3, 4))
        for (let s = 2; s < across - 1; s += pick(3, 4)) block(...at(a, s), 'three-quarters');
      blob(pick(5, width - 6), pick(3, height - 4), 1);
      break;
    }
    case 'stair': {
      const steps = Math.max(width, height);
      for (let i = 0; i < steps; i++) {
        const a = Math.round((i / steps) * span);
        const s = Math.round((i / steps) * (across - 1));
        rough(...at(a, s));
        rough(...at(a, Math.min(across - 1, s + 1)));
      }
      block(...at(Math.floor(span / 3), across - 2), 'three-quarters');
      block(...at(Math.floor((2 * span) / 3), 1), 'three-quarters');
      break;
    }
    case 'deck': {
      const mid = Math.floor(span / 2);
      block(...at(mid, Math.floor(across / 2)), 'three-quarters');
      for (let i = pick(3, 5); i > 0; i--)
        rough(...at(mid + pick(-2, 2), Math.floor(across / 2) + pick(-1, 1)));
      for (let a = 4 + pick(0, 1); a < span - 3; a += pick(4, 5)) {
        block(...at(a, 0));
        block(...at(a, across - 1));
      }
      break;
    }
    case 'maze': {
      for (let i = pick(6, 9); i > 0; i--) {
        const x = pick(3, width - 5);
        const y = pick(1, height - 2);
        const flat = r() < 0.5;
        const length = pick(2, 4);
        for (let l = 0; l < length; l++) {
          if (flat) block(x + l, y);
          else block(x, y + l);
        }
      }
      for (let i = pick(2, 4); i > 0; i--) rough(pick(3, width - 4), pick(1, height - 2));
      break;
    }
    case 'chasm': {
      const mid = Math.floor(span / 2);
      const crossing = pick(1, across - 2);
      const crossing2 = pick(1, across - 2);
      for (let a = mid - 1; a <= mid + 1; a++)
        for (let s = 0; s < across; s++) if (s !== crossing && s !== crossing2) rough(...at(a, s));
      block(...at(mid - 3, crossing));
      block(...at(mid + 3, crossing2));
      break;
    }
    case 'patches': {
      for (let i = pick(4, 7); i > 0; i--)
        blob(pick(4, width - 5), pick(2, height - 3), pick(1, 2));
      for (let i = pick(2, 4); i > 0; i--) block(pick(3, width - 4), pick(1, height - 2));
      break;
    }
    case 'roofs': {
      for (let a = 6 + pick(0, 2); a < span - 4; a += pick(5, 6)) {
        const bridge = pick(0, across - 1);
        for (let s = 0; s < across; s++) if (s !== bridge) rough(...at(a, s));
      }
      for (let i = pick(3, 5); i > 0; i--)
        block(pick(3, width - 4), pick(1, height - 2), 'three-quarters');
      break;
    }
  }
  return {
    width,
    height,
    difficult: [...difficult.values()],
    cover: [...cover.values()],
    partySide,
    foeSide,
  };
}

/** Squares nearest an edge, starting from the middle of it. */
function spawn(layout: Layout, side: Side, count: number, taken: Set<string>): Square[] {
  const { width, height } = layout;
  const blocked = new Set([...layout.difficult, ...layout.cover].map((c) => `${c.x},${c.y}`));
  const horizontal = side === 'W' || side === 'E';
  const across = horizontal ? height : width;
  const span = horizontal ? width : height;
  const order = Array.from({ length: across }, (_, i) => i).sort(
    (a, b) => Math.abs(a - (across - 1) / 2) - Math.abs(b - (across - 1) / 2),
  );
  const found: Square[] = [];
  for (let depth = 0; depth < span && found.length < count; depth++) {
    const along = side === 'W' || side === 'N' ? depth : span - 1 - depth;
    for (const s of order) {
      if (found.length === count) break;
      const square = horizontal ? { x: along, y: s } : { x: s, y: along };
      const key = `${square.x},${square.y}`;
      if (blocked.has(key) || taken.has(key)) continue;
      taken.add(key);
      found.push(square);
    }
  }
  if (found.length < count) throw new Error('Battlefield too small for its combatants');
  return found;
}

interface RosterEntry {
  key: string;
  name: string;
  description: string;
  srd: string;
}

/** Counts are authored for four players; other tables scale, within the fight's sixteen places. */
export function foeRoster(e: KitEncounter, size: number): RosterEntry[] {
  const room = 16 - size - (e.boss ? 1 : 0);
  const scaled = (e.foes ?? []).map((foe) => ({
    foe,
    n: Math.max(1, Math.round((foe.count * size) / 4)),
  }));
  let total = scaled.reduce((sum, x) => sum + x.n, 0);
  while (total > room) {
    const biggest = [...scaled].sort((a, b) => b.n - a.n)[0];
    if (!biggest || biggest.n <= 1) break;
    biggest.n -= 1;
    total -= 1;
  }
  const roster: RosterEntry[] = [];
  let serial = 0;
  for (const { foe, n } of scaled)
    for (let i = 1; i <= n; i++) {
      serial += 1;
      roster.push({
        key: `${e.key}-foe-${serial}`,
        name: n > 1 ? `${foe.name} ${i}` : foe.name,
        description: foe.description,
        srd: foe.srd,
      });
    }
  if (e.boss) roster.push({ key: `${e.key}-boss`, ...e.boss });
  return roster;
}

export function kitFoes(e: KitEncounter, size: number): CampaignEntity[] {
  return foeRoster(e, size).map((foe): CampaignEntity => ({
    key: foe.key,
    name: foe.name,
    kind: 'creature',
    description: foe.description,
    status: 'active',
    existsSince: null,
    placement: { location: e.location, since: null },
    statBlock: statBlockFor(foe.srd),
  }));
}

export function kitEncounter(e: KitEncounter, party: readonly string[]): Built {
  const layout = layoutFor(e.layout ?? 'forest-clearing', e.key);
  const roster = foeRoster(e, party.length);
  const taken = new Set<string>();
  const heroes = spawn(layout, layout.partySide, party.length, taken);
  const foes = spawn(layout, layout.foeSide, roster.length, taken);
  return {
    key: e.key,
    title: e.title,
    location: e.location,
    trigger: `${e.trigger} Цель: ${e.objective}${e.peaceful ? ` Мирный путь: ${e.peaceful}` : ''} Тактика: ${e.tactics}`,
    battlefield: {
      width: layout.width,
      height: layout.height,
      difficult: layout.difficult,
      cover: layout.cover,
    },
    combatants: [
      ...party.map((entity, index) => ({
        entity,
        side: 'party' as const,
        position: heroes[index] as Square,
      })),
      ...roster.map((foe, index) => ({
        entity: foe.key,
        side: 'hostile' as const,
        position: foes[index] as Square,
      })),
    ],
  };
}
