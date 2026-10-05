import { RAVENFORD_FIXTURES_DIR } from '../../world-engine/ravenford-seed.ts';
import { NEVER_FOR_PLAYERS } from './secrets.ts';

/**
 * Test support: the words of one language's Ravenford scenario (docs/adr/0031-play-language.md §9).
 * The drivers act on IDs; only what a person types, and what the scenario looks up
 * by its wording, lives here.
 */
export interface ScenarioScript {
  readonly language: 'en' | 'ru';
  readonly fixturesDir: string;
  readonly talkLine: string;
  readonly hypothesis: string;
  readonly tomasRequest: string;
  readonly tomasEdited: string;
  readonly tomasRefined: string;
  readonly chapterTitle: string;
  /** A recall query that finds the party's battle memory, and the start of its summary. */
  readonly battleQuery: string;
  readonly battlePrefix: string;
  readonly neverForPlayers: readonly string[];
}

export const EN_SCRIPT: ScenarioScript = {
  language: 'en',
  fixturesDir: RAVENFORD_FIXTURES_DIR,
  talkLine: 'Good morning!',
  hypothesis: 'Someone wanted the attack to look like goblins.',
  tomasRequest: 'Add a young guard near North Gate who saw the caravan leave.',
  tomasEdited: 'A young guard of the Ravenford Guard, 22 years old.',
  tomasRefined:
    'A young guard of the Ravenford Guard, 22 years old, sharp-eyed on the night watch.',
  chapterTitle: 'Chapter I — Shadows on the Trade Road',
  battleQuery: 'fought',
  battlePrefix: 'We fought',
  neverForPlayers: NEVER_FOR_PLAYERS,
};
