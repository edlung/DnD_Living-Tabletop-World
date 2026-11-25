# Stage 1180 completion — the table's screen

Work order `work-orders/STAGE_1180.md`; ADR 0075 §19; the owner's word
`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`; plan `docs/BOOK_SECOND_PASS_PLAN.md`;
2026-11-25. Branch `claude/stage-1180-table-screen`, stacked on
`claude/stage-1170-pages-by-tasks` (pull request 100). Status: **implemented; nothing is merged or
deployed.**

## What the table sees now

| On the screen                          | Before                                                     | Now                                                                                    |
| -------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A fight, 1920 × 1080                   | The order of turns across the top, the map about a quarter | The order a column at the left, the map beside it at 989 of 1080 px                    |
| A long order of turns                  | A strip that scrolled sideways                             | Eight large, twelve and sixteen smaller, all whole; more keep whoever acts in view     |
| Two unnamed creatures                  | A number of about 13 px on the portrait                    | The number sized by the screen (about 22 px at 1080 lines)                             |
| Whom the table waits for, in a fight   | The foot at the left                                       | The head of the map, beside the column                                                 |
| The rolls, none yet                    | A beige sheet with one line                                | A spread: the book's emblem on the left page, the line on the right                    |
| The way in, the table not open         | A beige sheet with the name and one line                   | The same spread                                                                        |
| A title page (no chapter yet, a title) | The game's dark castle beside the title, in every campaign | The book's own emblem where it has one; the game's art where it has none               |
| No fight, a place with no picture      | The castle across the screen under a plate                 | The book's cover with its emblem and the title as the cover's lettering                |
| Words read aloud                       | White words on a dark veil over the picture                | The picture as the plate, the words on the book's paper at its foot, in the page's ink |

Nothing a screen is sent changed; the server is untouched. The players' "Table screen" online is
as it was.

## New phrases of the interface

None: the stage changes how the screen is laid out, not what it says.

## Files

New: `apps/web/src/styles/display-spread.css`, `tests/e2e/table-screen.spec.ts`,
`work-orders/STAGE_1180.md`. Changed: `apps/web/src/display/cast-views.tsx` (`TitleCard`'s
`emblem`; `Battle` keeps whoever acts in view), `display/display-app.tsx` (the book's emblem),
`apps/web/src/main.tsx` (the stylesheet), `tests/e2e/display-room.spec.ts` (the fight's layout),
`tests/e2e/fixtures/sign-in-campaigns.json` (`screenBook`), ADR 0075 §19, the context map, the
client's and the journeys' `AGENTS.md`, the plan's statuses.

## Verification

| Check                                                          | Result                  |
| -------------------------------------------------------------- | ----------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass                    |
| `pnpm run context-budget`                                      | pass                    |
| `pnpm run test` (unit)                                         | 5,127 of 5,127          |
| Chromium, every journey but `party-known` and the voice        | 392 of 392              |
| The iPad project (WebKit), in the same run                     | 30 of 31, then 31 of 31 |

The whole run was made on this branch after its last change to the client. Its one failure was
the last journey of the twenty-three minutes, `ritual-checkpoint` in the iPad project: the DM's
shelf did not show the next game within twenty seconds (four of its page's requests were still
waiting). The same journey then passed alone, and the whole iPad project run by itself passed
31 of 31; in Chromium it passed in the run. Nothing of this stage is on that page. Before the
run, the six journeys of the table's screen ran alone, the new one among them.

Looked at by eye on a paired screen of the lighthouse's campaign at 1920 × 1080, 1280 × 720,
1024 × 768 (a 4:3 projector, a flat board) and 768 × 1024 (upright): a fight of five, and of
eight, twelve, sixteen and twenty (the order's rows copied on the page), the rolls with none yet,
the empty Chronicle, the way in of a closed table, no fight, a place's scene, a picture, words
read aloud. The layout audit (`ui-layout-audit`) of each of those casts at the four sizes is
clean, but for its reading-page rule about content wider than 1600 px, which a television's page
is by design.

Not run: `party-known`, `voice.spec.ts`, the `webkit` project of the release journeys, the native
shells, a real television.

## Left

- On a flat board (a screen under 1200 px wide) a name plate at the map's edge reaches past the
  map and that edge fades; it did before this stage, and the fix belongs to the plates' layer
  every board shares.
- "Unpair every screen" on the DM's Screen page is a plain line of text with no question before
  it acts (found while pairing screens for this stage; not changed).
- Fifty-two library campaigns have no emblem of their own: their title pages keep the game's key
  art.
