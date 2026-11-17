# Stage 840 completion — players' private notes and a hero's backstory

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/53 (draft, stacked on
Stage 830's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/52).

Work order `work-orders/STAGE_840.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 840); ADR 0073
§5; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch
`claude/stage-840-notes-and-backstory`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule. (Both were planned in Stage 630
and never built.)

## What changed

- **A fifth tab on a hero's sheet, "Story"**, for the hero's own player and for the DM.
- **The hero's backstory**: where the hero comes from and what it wants, up to 4000 characters.
  Its player and the DM read it and either may change it — the DM for a child who tells it
  aloud. Nobody else at the table sees it. The page says so before a word is typed.
- **"My notes"**: a player's private notes, up to fifty. Only their writer reads them — not the
  DM, in the DM's view or in the character's, and not another player. The DM's own tab says that
  such notes may exist and are not the DM's to read.
- **Kept beside the world** (`ltw_backstories`, `ltw_player_notes`, migration 0045, additive):
  neither is canon, and the World Engine reads neither. They move with a campaign.
- **Privacy**: the notice names both; a person's copy of their data holds their heroes'
  backstories and their own notes; deleting an account deletes its notes (a hero keeps its
  backstory, as it keeps its place in the story).
- **Session's decisions**: all of ADR 0073 §5; they are listed in the work order.

## Found and fixed on the way

From the independent UX, copy and accessibility pass (a reviewing subagent, reading the source):

- **Words typed and not saved were lost silently** to another tab, to Escape, to the close
  button. The Story tab now stays where it is while another tab shows, and the sheet asks
  before it closes on unsaved words ("Keep writing" / "Close without saving").
- **A field left open could erase the other person's text**: it filled once and then ignored
  what the DM (or the player) saved meanwhile. It now follows what is kept until someone types,
  and says when the kept text changed under the typing.
- Focus was lost on "Write a note", "Change", "Delete"; a failed delete said nothing; the limits
  bit unannounced; fifty identical "Change" and "Delete" buttons; the DM was not told that notes
  exist; the key Russian line was ungrammatical; «Предыстория» is the builder's word for a
  Background (it is «История героя» now); the privacy notice said the DM "sees the whole
  campaign" (now: "— except your private notes").

By looking at the screens: with five tabs, «Заклинания» and «Снаряжение» ran into each other on
a 390 px phone. The tabs share the row by their words now; a journey holds each word inside its
own tab at 390 and 320 px.

## Verification

| Check                                                                                                              | Result                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                                                  | pass                                                                            |
| Lint                                                                                                               | pass on the files changed since Stage 830; the whole repository is linted by CI |
| Unit tests                                                                                                         | pass — 595 files, 4774 tests                                                    |
| Integration tests (PostgreSQL 16)                                                                                  | pass — 83 files, 403 tests (the two tables against the in-memory store)         |
| Build                                                                                                              | pass                                                                            |
| Journeys, Chromium: `hero-story`, `hero-story-words`, and the neighbours `character-sheet` (five), `privacy` (two) | pass                                                                            |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian                                                    | looked at, 30 screenshots: the tab empty, while writing, with a note            |
| Independent UX, copy and accessibility pass                                                                        | done from the source; findings above, fixed                                     |

**Adversarial pass against the boundary.** The stage is its boundary. A backstory is read and
written by its hero's player and the DM, and refused to another hero's player, to the party's
and the public view, to a stranger and to a table display (unit tests per reader). A note is
kept under its writer's own seat and the character they play: the DM asking in the DM's view
or in that character's view reads none of them, and neither does whoever takes the seat later.
Nobody's live stream is signalled by another's writing. The journey reads everything the DM's
browser and another player's browser were sent while a note was written and finds no word of
it; the other player is sent no word of the backstory either. A person's copy holds their own
notes and nobody else's. What is left: the operator can read the database, as the privacy
notice says; and a backstory is words a player typed — the DM decides what the world takes
from them.

## Not verified

- **The whole browser suite was not run on this branch** in this environment; the pull
  request's CI runs it on both engines.
- **WebKit / the `ipad` project**: not installed here; `hero-story.spec.ts` is in the `ipad`
  list and runs in CI.
- **A real phone with its keyboard up** over the eight-row field; a screen reader's actual
  announcements; Android's Back on the sheet with unsaved words (Escape and the close button
  were tried).
- Escape pressed a second time while the sheet asks may close it in some browsers: the question
  is asked once.

## For the owner

Merge after pull request 52 (Stage 830). Migration 0045 is additive. Only the owner can: merge,
deploy, and see whether the children write there — and whether "only you read these" is a
promise this family wants.
