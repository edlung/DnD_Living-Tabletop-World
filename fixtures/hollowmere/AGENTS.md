# The Bells of Hollowmere (English)

The starter adventure for levels 1–5 (docs/adr/0058-campaign-content.md §5). **Generated:** every
JSON file here is written by `scripts/adventures/hollowmere/build.ts` (`pnpm adventures:build`) from
the adventure's two-language source; never edit one by hand. The Russian copy is in
`../hollowmere-ru/`, built from the same source in the same run.

| File                      | Content                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world-seed.json`         | The campaign (`adventure: hollowmere`, levels by milestones), its places, people, factions, features and story objects, the opening scene at Ravenford's North Gate. |
| `foes-seed.json`          | **DM data.** Every foe, unplaced, with its SRD stat block; Kerra Reed's and the lantern-bearer's stat blocks.                                                        |
| `people-seed.json`        | **Contains secrets.** Public rumours, the party's hire, each person's knowledge (willing ones set so), world truths, DM notes.                                       |
| `items-seed.json`         | What people carry and the chamber holds, from the SRD's catalog.                                                                                                     |
| `party-seed.json`         | Four ready-made level-1 characters as builder choices (`CreateCharacter` with no player): free for invitations.                                                      |
| `investigation-seed.json` | **DM data.** Clues by looking, by a check or by Detect Magic.                                                                                                        |
| `quests.json`             | The quest book a campaign of this adventure reads.                                                                                                                   |
| `encounters.json`         | **DM data.** Seven prepared encounters, one or two a chapter.                                                                                                        |
| `library.json`            | The DM's library a new campaign starts with: four handouts, three random tables.                                                                                     |
| `assets/`                 | The curated GPT pictures (`manifest.json`; `scripts/curated-set/cli.ts`), never edited by hand.                                                                      |

- Foes and anything a player meets unnamed have opaque IDs (`foes.ts` `opaque`), stable between builds.
- Fixtures contain WORLD_TRUTH and DM secrets: never copy them into player-facing code, prompts or logs.
