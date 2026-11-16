# Stage 830 completion — the party's encyclopedia

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/52 (draft, stacked on
Stage 820's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/51).

Work order `work-orders/STAGE_830.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 830); ADR 0073
§4; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch
`claude/stage-830-party-encyclopedia`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **"What we know"**, a third view in the Chronicle beside "By chapter" and "The whole book":
  who and what the party knows of — people and creatures, places, things and factions — each
  with what the party knows of it, a picture where the party has one, and the party's chapters
  that tell of it; then what else the party has learned, and what it set out to do.
- **A field to find a name.**
- **Read as the party, whoever opens it**: a player and the DM see the same page, and nothing
  the DM alone knows is on it or is sent for it. Read only.
- **No server change**: the page is assembled from four reads that exist. No table, no
  migration, no AI.
- **Session's decisions**: all of ADR 0073 §4; they are listed in the work order.

## Found and fixed on the way

From the independent UX, copy and accessibility pass (a reviewing subagent, reading the source):

- **The field's label was light on parchment** (about 1.4:1): the page's ink now.
- A read that failed in part showed "The party knows the name, and nothing more yet" for every
  entry — untrue — and a failed re-read replaced a good page with it. A part that fails keeps
  what was read before; one never read is left out and said to be, with "Try again".
- Coming back from a chapter showed the loading panel and the top of the page: the page keeps
  what it read.
- Pressing a chapter dropped the focus; the focus ring and the chapter buttons' hover were pale
  on parchment; the buttons were 36 px; the words promised whom the party "met" and where it
  "has been", which the page cannot know.

Not taken: the page's heading stays a second-level heading beside the Chronicle's own.

## Verification

| Check                                                                                           | Result                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                               | pass                                                                                                                                                                                    |
| Lint                                                                                            | pass on the files changed since Stage 820; the whole repository is linted by CI                                                                                                         |
| Unit tests                                                                                      | pass for the web client, the dictionaries and the architecture rules (99 files, 641 tests); the server's and the packages' suites were not run again — the stage changes no server code |
| Integration tests                                                                               | not run: no server or database change                                                                                                                                                   |
| Journeys, Chromium: `party-known` (two), and the neighbours `campaign-book`, `chronicle-writer` | pass                                                                                                                                                                                    |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian                                 | looked at, 30 screenshots: the page, a name found, no name found                                                                                                                        |
| Independent UX, copy and accessibility pass                                                     | done from the source; findings above, fixed                                                                                                                                             |

**Adversarial pass against the boundary.** The page must hold no secret even when the DM opens
it. Every read behind it is made in the party's view (`api.as('PARTY')`), the pictures too. The
journey opens the page as the DM, collects everything the DM's browser was sent in that view,
and looks in both the page and the traffic for each of the test world's forbidden markers (the
alchemist, the arranged ambush, the hidden places and things): none. The DM's page lists the
same names as the player's. Chapters offered under an entry are the party's own.

## Not verified

- **The whole browser suite, the whole unit suite and the integration suite were not run on
  this branch** in this environment; the pull request's CI runs them.
- **WebKit / the `ipad` project**: not installed here; `party-known.spec.ts` is in the `ipad`
  list and runs in CI.
- **A long campaign**: the page was looked at with the test world's ten people and a dozen
  places, not with hundreds of entries.
- A real phone; a screen reader's actual announcements.

## For the owner

Merge after pull request 51 (Stage 820). No migration. Only the owner can: merge, deploy, and
see whether the family opens the page between games.
