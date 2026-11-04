import { z } from 'zod';

import type { Weather } from '../visual/commands.ts';
import type { PlaceSetting } from '../visual/views.ts';

/**
 * The table's sound (docs/adr/0059-atmosphere.md §1, §3): five soundscapes synthesized in the
 * browser, never recorded, and the DM's choice among them — one, none, or "by the scene". Kept
 * with the table's state, beside the world. Shapes and the scene's rule only.
 */
export const AMBIENCES = ['rain', 'wind', 'fire', 'crowd', 'night'] as const;
export type Ambience = (typeof AMBIENCES)[number];

export const AMBIENCE_CHOICES = ['scene', 'none', ...AMBIENCES] as const;
export type AmbienceChoice = (typeof AMBIENCE_CHOICES)[number];
export const ambienceChoiceSchema = z.enum(AMBIENCE_CHOICES);

/** What the table hears, as its state keeps it. */
export interface TableSound {
  readonly ambience: AmbienceChoice;
}

export const FRESH_SOUND: TableSound = { ambience: 'scene' };

/** What a scene says about its sound: as the screen's perspective sees the place. */
export interface SceneSound {
  /** Where the place is, as the perspective knows it. */
  readonly setting: PlaceSetting;
  readonly weather: Weather | null;
  readonly night: boolean;
}

/**
 * The ambience "by the scene" (ADR 0059 §1): under a roof, a fire; under rain or a storm, rain; at
 * night, night; in a town, a crowd; anywhere else, the wind.
 */
export function sceneAmbience(scene: SceneSound): Ambience {
  if (scene.setting === 'indoors') return 'fire';
  if (scene.weather === 'rain' || scene.weather === 'storm') return 'rain';
  if (scene.night) return 'night';
  return scene.setting === 'town' ? 'crowd' : 'wind';
}

/** The ambience a choice plays in a scene; null for none. */
export const ambienceFor = (choice: AmbienceChoice, scene: SceneSound | null): Ambience | null =>
  choice === 'none' ? null : choice === 'scene' ? (scene ? sceneAmbience(scene) : null) : choice;
