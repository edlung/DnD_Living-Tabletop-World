# The DM's image controls (`src/images/`)

Stage 330 part B (`docs/STAGE_330_DESIGN.md` "DM controls"; ADR 0022 §5, ADR 0035 §4, §6): the
DM's view of the campaign's pictures and the DM's commands on them. Figures, battle maps and an
object's picture for everyone live beside the pictures they extend (`../visual/miniature.tsx`,
`../combat/board/`, `../world/scene-objects.tsx`, `../world/entity-details.tsx`).

| Concern                                                                                     | File                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| An entity's pictures from the DM lineage: approved now, candidates, in progress, failed     | `lineage.ts`                                                                   |
| What may be requested per entity kind; `RequestAsset` as sent; repeating a request          | `lineage.ts`                                                                   |
| Words: a picture's kind, the states a variant is for, the fixed failure reasons, job states | `words.ts`                                                                     |
| The lineage read (DM perspective only) and the one-at-a-time command with its result        | `dm-images.ts`                                                                 |
| The entity's images in its panel; the request form; cards; the Images sheet                 | `entity-images.tsx`, `request-form.tsx`, `image-cards.tsx`, `images-sheet.tsx` |

Rules:

- DM only. `DmImagesContext` is provided by the world screen (`world-pictures.tsx`, beside the
  picture cache) in the DM perspective alone; without it every component renders nothing and
  nothing is read. The lineage route takes no perspective and is never requested for a lower one. Candidates, requests, notes, labels and generators are
  DM data: never render them in a player's view (`tests/e2e/images-dm.spec.ts` asserts the
  player's page and network).
- Show only what the server says. "Approved now" mirrors the presentation's rule (the canonical
  picture, the newest approved of each kind); a job's state is its lineage status and its fixed
  failure reason (`FAILURE_WORDS`), never invented progress. Pictures are shown whole
  (`object-fit: contain`) so the DM judges what players would see.
- Requests are built from the entity's kind and recorded description by the server; the DM's
  note is the one thing added, and the form says it reaches the image model. A figure, a battle
  map or a variant derives from the approved main picture: those choices stay disabled without
  one. Each press is one request (a paid generation in play): nothing is requested by itself.
- Discard is `RetractAsset` of a candidate; Replace asks for another picture of the same kind,
  and the current one stays until the DM approves the new one; Generate again and Try again
  repeat the request with its own note. Commands go one at a time with a client command ID kept
  across an uncertain answer (Retry sends the same command).
- The DM's live coverage includes the lineage (`apps/server/src/live/inventory.ts`), so the
  controls follow the asset worker without polling; after each own command the world re-reads.
- Every new string has a Russian entry in `../i18n/ru-images.ts`; buttons carry their picture in
  their accessible name ("Approve: At night"), beginning with their visible word.
- Tests: `lineage.test.ts` (approved-now, candidates, work, failures superseded by a later
  request, per-kind choices, the command as sent, words in both languages); journeys
  `tests/e2e/images-dm.spec.ts`, `images-curated.spec.ts`, `images-accessibility.spec.ts`.
