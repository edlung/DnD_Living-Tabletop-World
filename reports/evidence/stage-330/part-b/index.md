# Stage 330 part B evidence screenshots

JPEG (quality 62, each at most 250 KB) at 390 × 844 (phone), 820 × 1180 (tablet) and 1440 × 900
(desktop), in English (`en-`) and Russian (`ru-`), taken by
`npx playwright test -c playwright.evidence.config.ts tests/evidence/stage-330-part-b.evidence.ts`
against the seeded browser-test servers (the image journeys' campaigns of
`apps/server/src/testing/ui-image-journeys.ts`). Every picture shown is from the curated GPT set
(`fixtures/ravenford-ru/assets/manifest.json`); the candidates are curated pictures the review
campaigns hold unapproved, so no placeholder picture appears. Battlefield screens come tilted and
flat (`-tilted`, `-flat`). File names: `<lang>-<screen>[-<view>]-<width>.jpg`.

| Screen             | What it shows                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scene`            | The player's scene: Market Square's approved picture behind everything; Elowen and Mira standing as their approved figures with name plates; the party rail portrait.                                                                                                    |
| `conversation`     | A conversation with Mira: her approved portrait in the dialogue panel and the panel's header; what was learned as a typed record; Mira's figure selected.                                                                                                                |
| `battlefield`      | The player's turn on the Old Trade Road: the approved battle map under the grid, the figures standing (tilted) or inside their medallions (flat), cover pieces; every name plate above the figures (re-shot after the part B review: no figure hides a plate behind it). |
| `object`           | An investigation object (the broken wagon wheel, unnamed to the player) with its approved picture as a plate in its panel; the Abandoned Caravan Site behind.                                                                                                            |
| `dm-images-sheet`  | The DM's Images sheet: North Gate's candidate "At night" beside a request being generated and a failed one with its fixed reason; Captain Thorne below.                                                                                                                  |
| `dm-images-place`  | North Gate's panel for the DM: approved pictures with Replace, the candidate with Approve, Discard and Generate again, the requests, the request form.                                                                                                                   |
| `dm-images-figure` | Captain Thorne's panel: his figure for the battlefield as a candidate, a request waiting for the image generator, the request form with the note to the model.                                                                                                           |

Files (48): for each `en` and `ru`: `scene`, `conversation`, `object`, `dm-images-sheet`,
`dm-images-place`, `dm-images-figure` at `phone`, `tablet`, `desktop`; `battlefield-tilted` and
`battlefield-flat` at the three widths.
