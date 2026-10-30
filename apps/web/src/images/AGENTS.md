# The DM's image controls (`src/images/`)

Stage 330 part B (`docs/STAGE_330_DESIGN.md` "DM controls"; ADR 0022 §5, ADR 0035 §4, §6 and the
amendment "part B review"): the DM's view of the campaign's pictures and the DM's commands on them.
Figures, battle maps and an object's picture for everyone live beside the pictures they extend
(`../visual/miniature.tsx`, `../combat/board/`, `../world/scene-objects.tsx`,
`../world/entity-details.tsx`).

| Concern                                                                                      | File                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| An entity's pictures from the DM lineage: approved now, candidates, in progress, failed      | `lineage.ts`                                                                   |
| What players see of a picture just approved, read from the lineage (`approvalStanding`)      | `lineage.ts`                                                                   |
| What may be requested per entity kind; `RequestAsset` as sent; repeating a request           | `lineage.ts`                                                                   |
| Words: a picture's kind, states, failure reasons, job states, an approval, a pending command | `words.ts`                                                                     |
| The one command at a time: sent, answered, settled by the lineage read after it, or lost     | `command-state.ts` (pure), `dm-images.ts` (the lineage read and the hook)      |
| A command's result where it was given; a pending one, with Retry, everywhere else            | `images-result.tsx`                                                            |
| Focus when a command takes away the card it was pressed on                                   | `focus-recovery.ts`                                                            |
| The entity's images in its panel; the request form; cards; the Images sheet                  | `entity-images.tsx`, `request-form.tsx`, `image-cards.tsx`, `images-sheet.tsx` |

Rules:

- Canonical images adopted during campaign activation may have preparation `origin`
  metadata and no corresponding in-play request. Validate that origin with the public
  schema before describing its source revision; never invent a queue/job card for it.
  The player asset whitelist stays unchanged.

- DM only. `DmImagesContext` is provided by the world screen (`world-pictures.tsx`, beside the
  picture cache) in the DM perspective alone; without it every component renders nothing and
  nothing is read. The lineage route takes no perspective and is never requested for a lower one. Candidates, requests, notes, labels and generators are
  DM data: never render them in a player's view (`tests/e2e/images-dm.spec.ts` asserts the
  player's page and network).
- Show only what the server says. Approving a picture supersedes the approved one of its kind on
  the server (the same entity and purpose; an image also the same label), so each kind has one
  approved picture; "approved now" mirrors the presentation's rule for an earlier writer's history
  that left several (the canonical picture, the newest approved of each kind). A job's state is its
  lineage status and its fixed failure reason (`FAILURE_WORDS`), never invented progress. Pictures
  are shown whole (`object-fit: contain`) so the DM judges what players would see.
- What a command did is worded from the lineage read after it (`approvalWords` over
  `approvalStanding`), never assumed: the main picture, a figure or a battle map is what players
  who can see the entity now see; a state picture shows only in its state ("at night", "in snow");
  a DM-only picture, or one no longer the shown one of its kind, says so. Never claim more.
- Requests are built from the entity's kind and recorded description by the server; the form
  shows that description word for word from the lineage (`descriptions`) and that players may not
  know it (ADR 0035 amendment "Gate 06 remediation"); the DM's note is the one thing added, and the
  form says it reaches the image model. A figure, a battle
  map or a variant derives from the approved main picture: those choices stay disabled without
  one. Each press is one request (a paid generation in play): nothing is requested by itself.
- Discard is `RetractAsset` of a candidate; Replace asks for another picture of the same kind,
  and the current one stays until the DM approves the new one; Generate again and Try again
  repeat the request with its own note.
- One command at a time (`command-state.ts`): every image control waits from the press until a
  lineage read that started after the world's answer shows what the command did (a failed read is
  repeated every `SETTLE_REREAD_MS`), so the card the DM pressed is gone before anything can be
  pressed again. Waiting controls are `aria-disabled` (focus stays on them) and ignore presses;
  `DmImages.run` refuses a second command too. A lost answer holds the controls: its subject,
  state and Retry show where it was given and, through `ImagesResult`, in the Images sheet and
  whichever panel is open; Retry sends the same client command ID, and its result shows where it
  was pressed, naming the picture with its entity there.
- Focus (`focus-recovery.ts`): when a command's result shows and focus went with the card it was
  pressed on, focus moves once per command — never on a later read of the lineage — to the card
  that followed it (`data-image-key`), else the entity's heading in the sheet
  (`data-image-heading`), else the panel's images or the sheet; a lost answer whose card went
  meanwhile moves focus to Retry (`data-image-retry`).
- The DM's live coverage includes the lineage (`apps/server/src/live/inventory.ts`), so the
  controls follow the asset worker without polling; after each own command the world re-reads.
- Every new string has a Russian entry in `../i18n/ru-images.ts` (also the state phrases of
  `whenWords`, which `tests/i18n/client-dictionary.test.ts` cannot find); buttons carry their
  picture in their accessible name ("Approve: At night"), beginning with their visible word.
- Tests: `lineage.test.ts` (approved-now, candidates, work, failures superseded by a later
  request, per-kind choices, the command as sent, what an approval did, pending words, words in
  both languages), `command-state.test.ts` (the controls wait for the lineage read after the
  answer; a lost answer waits for Retry, from anywhere); journeys `tests/e2e/images-dm.spec.ts`,
  `images-commands.spec.ts` (supersession, a lost answer, a double press, the keyboard, a panel's
  focus once), `images-curated.spec.ts`, `images-accessibility.spec.ts`.
