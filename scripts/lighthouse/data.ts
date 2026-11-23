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
/** A scene; `readAloud` is what the DM reads as it begins (docs/CAMPAIGN_TEXT_STANDARD.md §5). */
export interface Scene {
  title: string;
  minutes: number;
  readAloud?: string;
  play: string;
  choices: string[];
  check: string;
  failForward: string;
}
type Act =
  (typeof act1)[number] | (typeof act2)[number] | (typeof act3)[number] | (typeof act4)[number];
export type Chapter = Omit<Act, 'scenes'> & { scenes: Scene[] };
export const chapters: Chapter[] = [...act1, ...act2, ...act3, ...act4];
export const DEFAULT_PARTY = ['finn', 'tess', 'asya'] as const;
export const HERO_KEYS = [...DEFAULT_PARTY, 'mika'] as const;
export type HeroKey = (typeof HERO_KEYS)[number];
