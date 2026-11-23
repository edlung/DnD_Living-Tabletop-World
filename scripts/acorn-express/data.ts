import world from '../../campaigns/acorn-express/source/world.json' with { type: 'json' };
import cast from '../../campaigns/acorn-express/source/cast.json' with { type: 'json' };
import clues from '../../campaigns/acorn-express/source/clues.json' with { type: 'json' };
import items from '../../campaigns/acorn-express/source/items.json' with { type: 'json' };
import handouts from '../../campaigns/acorn-express/source/handouts.json' with { type: 'json' };
import act1 from '../../campaigns/acorn-express/source/act-1.json' with { type: 'json' };
import act2 from '../../campaigns/acorn-express/source/act-2.json' with { type: 'json' };
import act3 from '../../campaigns/acorn-express/source/act-3.json' with { type: 'json' };
import act4 from '../../campaigns/acorn-express/source/act-4.json' with { type: 'json' };

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
export type Chapter = Omit<(typeof act1)[number], 'scenes'> & {
  scenes: Scene[];
  projects?: {
    title: string;
    needs: string;
    actions: string[];
    success: string;
    ifDelayed: string;
  }[];
  epilogues?: { hero: string; question: string; letter: string; image: string }[];
};
export const chapters: Chapter[] = [...act1, ...act2, ...act3, ...act4];
export const DEFAULT_PARTY = ['boris', 'nika', 'yara'] as const;
export const HERO_KEYS = [...DEFAULT_PARTY, 'oren'] as const;
export type HeroKey = (typeof HERO_KEYS)[number];
