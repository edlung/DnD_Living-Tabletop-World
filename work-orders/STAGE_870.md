# Work Order — Stage 870: Theatre of the mind on the table's screen

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 870, decision 11); ADR 0073 §8, written with the
stage. Branch `claude/stage-870-story-cast`, stacked on Stage 860's.

## Deliver

1. **A cast "A picture with words to read aloud"**: one picture the party knows, or none, and up
   to six hundred characters of words; the table's screen filled with the picture, the words over
   its lower part.
2. **The DM's fields for it**: the picture, the words, and a paragraph of the party's chapters to
   take.
3. **Online**: it is every player's shared screen.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §8.
- The words are typed by the DM or taken from the party's chapters: no narrator is called, and
  no AI capability is added. Fresh narration when AI is on stays an open point of the plan.
- Six hundred characters: a few lines someone reads aloud while the picture stands.
- Without a picture the game's own key art stands behind the words, as behind a title card.
- No new art is drawn or generated: the pictures are the world's approved ones.

## Boundaries

No migration (the cast is stored as it is), no table, no event, no world state. No AI. A display
still shows only approved pictures the party knows. Nothing is deployed; merging is the owner's
word.

## Checks

- Unit: the cast's shape and bounds; below the DM a known picture is kept, an unknown one
  dropped without its ID, the words kept; over HTTP the DM casts it, a display reads it, an
  unknown picture is 404, a display's own try 403.
- Journey: `story-cast.spec.ts` with a paired TV — words required; the picture fills the screen;
  the paragraphs; nothing runs off the screen; words alone; in Russian.
- A look at the cast on a TV's sizes (1920×1080, 1280×720, a tablet and a phone as a shared
  screen) and at the form at 1440, 768, 390, 320 and 832×400, in both languages; an independent
  UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_870_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 860's.
