import world from '../../campaigns/lighthouse/source/world.json' with { type: 'json' };
import cast from '../../campaigns/lighthouse/source/cast.json' with { type: 'json' };
import clues from '../../campaigns/lighthouse/source/clues.json' with { type: 'json' };
import items from '../../campaigns/lighthouse/source/items.json' with { type: 'json' };
import handouts from '../../campaigns/lighthouse/source/handouts.json' with { type: 'json' };
import act1 from '../../campaigns/lighthouse/source/act-1.json' with { type: 'json' };
import act2 from '../../campaigns/lighthouse/source/act-2.json' with { type: 'json' };
import act3 from '../../campaigns/lighthouse/source/act-3.json' with { type: 'json' };
import act4 from '../../campaigns/lighthouse/source/act-4.json' with { type: 'json' };

export { world, cast, clues, items, handouts };
export const chapters = [...act1, ...act2, ...act3, ...act4];
export type Chapter = (typeof chapters)[number];
export const DEFAULT_PARTY = ['finn', 'tess', 'asya'] as const;
export const HERO_KEYS = [...DEFAULT_PARTY, 'mika'] as const;
export type HeroKey = (typeof HERO_KEYS)[number];
