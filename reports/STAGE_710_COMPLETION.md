# Stage 710 completion — "Previously…" and the evening's chapter

Work order `work-orders/STAGE_710.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 1, decisions 8–11);
the owner's word of 2026-11-15, «Да, этап 710» (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); ADR
0071 §1; 2026-11-15. Status: **AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-710-previously`
from `main` `9881a3e8` plus the plan (PR 37). Session model: Claude Fable 5.2.

## What changed

- **The party's chapters are in every player's book.** A chapter told from the Party was listed only
  to a reader whose perspective was exactly `PARTY`: it showed on the TV and in no player's book. A
  player's book now reads the party's chapters as PARTY beside the player's own, marks them "told
  from the party" and reads their pictures, faces and flashbacks in the party's view. The DM's book
  is unchanged. Nothing changed on the server for this: the HTTP test now pins that a player's own
  view lists no party chapter and the PARTY view no DM-told one.
- **A chapter belongs to an evening.** Found while building: the world's clock moves only when time
  is advanced, so through most of an evening and from one evening to the next it stands still, and a
  window in world time cannot tell two evenings apart; a memory kept in a session may also be of an
  earlier hour than the session's start. `GenerateChronicle` takes an optional `sessionId`: of the
  window's memories the chapter tells only those recorded with that session and rests on the session
  too. It is refused for an unknown session and for the DM's view. A chapter without a session is
  what it was; `ChronicleGenerated` keeps version 4. The suggestions' route takes `session`: the
  moments recorded since that session started, so an earlier evening's are not offered again. The
  book's writer proposes the last session and its title (or the whole story), no longer "Chapter I —
  Shadows on the Trade Road" in every campaign with `from: 0`.
- **Closing the evening.** "End the session" on the Session sheet opens three short steps: the
  evening's moments (the server's suggestions for this session, each ticked or not, and a line of
  the DM's own, recorded as the evening's most salient moment), what happens after the end (the
  chapter, and on real sign-in the screens and guest seats as before), then "Yes, end the session".
  Every kept moment is a `RecordMemory` the World Engine decides, sent with the session before it
  ends; a refused one is named and left out; a step that fails leaves the earlier ones standing and
  says so. While the steps run the sheet names the one that runs (the session is gone from the
  table before a narrator has written its chapter). The sheet then takes focus and says what was
  done — moments kept, which prose the chapter holds, or why there is none — and opens the chapter,
  or asks for it again when it failed. A ruling from the Party sheet now carries its session.
- **"Previously…"** is the newest party chapter read as PARTY: its title, its main place's picture
  as the party saw it then, and at most three paragraphs exactly as written — those of its most
  salient moments, the later among equals, so it says where the table left off. A player reads it
  in brief under the place's card while no session is open (also the player who missed the
  evening), whole on demand, and opens it in the book; on a phone held wide the brief opens the
  book. The DM's start form shows it in brief and offers "Open with “Previously…” on the table's
  screen": the Chronicle is cast as the session starts, the TV shows it large, an online player's
  Table screen opens with it, the DM's panel holds the same words to read aloud — and says so when
  no screen is paired — and "Show the scene" moves every screen on. A cast that fails does not hold
  the session back and is said. In Russian it is «В прошлый раз…», the join screen's own words.
- **An independent UX pass** (task walkthroughs, copy in both languages, accessibility; a fresh
  agent reading the code and the screenshots) found no blocker and fifteen points; they were
  taken, but for the three listed under "Not verified, and limits".
- **Found and fixed on the way.** A player's Table screen opened only on a change of the cast it
  had already seen, so a session opened online with something already cast showed nothing: it now
  opens when the table goes online while the page is open, not on a reload (ADR 0044 §5 amended).
  The book's chapter heading was 9.9 px on a laptop: never under 12 px now. The recap's frame in
  the Table screen sheet takes focus, so the keyboard scrolls a long one.

## Files

Contracts `chronicle/commands.ts`, `chronicle/views.ts`. Domain `chronicle/entries.ts`,
`decide.ts`, `records.ts`, `views.ts`, `suggestions.ts` (`suggestionsOfSession`). Server
`http/routes/chronicle-routes.ts`. Client `chronicle/book-chapters.ts`, `previously.tsx`,
`chronicle-book.tsx`, `chapter-pages.tsx`, `generate-chapter.tsx`; `dm/session-sheet.tsx`,
`session-running.tsx`, `close-evening.tsx`, `evening.ts`, `party-sheet.tsx`; `session/lobby-banner.tsx`;
`display/cast-views.tsx`; `online/shared-screen.tsx`; `shell/use-shell.ts`; `styles/ritual.css`;
`i18n/ru-ritual.ts`. No migration, no new route, no new dependency.

## Verification

Run on the branch on 2026-11-15 (offline; no paid call):

| Check                                                               | Result                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                        | pass                                                                                                             |
| `pnpm run context-budget`                                           | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`, 544 lines), none from this stage             |
| `pnpm run test` (unit)                                              | 567 files, 4585 tests pass                                                                                       |
| `pnpm run build`                                                    | pass                                                                                                             |
| `pnpm run test:integration` (PostgreSQL, throwaway databases)       | 78 files, 392 tests pass, a session's chapter stored, read after a restart and replayed among them               |
| `pnpm run test:e2e` before `main` moved                             | 327 pass, 12 fail: the eleven journeys PR 36 mends and `voice.spec.ts:77`                                        |
| After merging `main` (`f5a89917`, PR 36): those eleven, the stage's | 46 pass, `voice.spec.ts:77` fails                                                                                |
| `ui-layout-audit` (the skill's `audit.mjs` in a temporary journey)  | no finding at 1440, 768, 390, 320 and 832×400 in English and Russian; the TV at 960×540, 1280×720, 1920×1080, 4K |

The stage's journeys: `evening-ritual.spec.ts` (Chromium on a laptop, WebKit on an iPad) and
`evening-ritual-screens.spec.ts` (a paired TV, an online player, the chapter's answer held to show
the sheet's progress). Journeys changed because the behaviour did: `chronicle-book`, `dm-tools`,
`language-ru` (the writer proposes the session's title), `dm-screen` (the end's steps).

## Adversarial pass (invariants 1–5, 7, 11, 19)

- A player asks for a DM-told chapter through the PARTY view, their own view and the DM's: none
  listed, 403 for the DM's (`chronicle-routes.test.ts`).
- A player or a stranger generates a session's chapter or reads a session's suggestions: 403 and
  404; the generic command route still refuses `GenerateChronicle`.
- A session's party chapter with other holders' memories recorded in the same session (Elowen's
  own, an NPC's): none told (`session-chapter.test.ts`).
- An unknown session, the DM's view with a session, a session nobody kept a moment of: refused
  (`INVALID_CHRONICLE`, 400, 422).
- Two evenings at one instant of the world: each chapter tells its own evening only; the second
  evening is offered none of the first's moments (domain and HTTP).
- Replay and the re-decision oracle over histories with session chapters: `world.verified()`.
- Everything a player's browser received and shows across the journey keeps the player's boundary
  markers; the Chronicle it read holds no PARTY-forbidden marker and not the unnamed place's ID;
  everything the TV received holds no PARTY-forbidden marker (`evening-ritual*.spec.ts`).
- A closing interrupted at each step: the moments kept stand, the session stays open or is ended as
  said, nothing is retried silently; pressing again repeats nothing (stable command IDs)
  (`evening.test.ts`).
- Looked for and left as designed: a player whose character was absent reads the party's chapter (a
  player may take PARTY, ADR 0008); the DM's own line is shown to the party — the field says so.

## Not verified, and limits

- `tests/e2e/voice.spec.ts:77` fails on this machine: the two browsers' WebRTC connection stays
  "connecting". It fails the same way with `main`'s `online/shared-screen.tsx` put back, and this
  stage touches nothing else of voice; it was not run on a clean checkout of `main` here. The pull
  request's CI decides.
- `pnpm run db:migrate` and `pnpm run seed:ravenford` were not run: the stage has no migration, and
  the local development database is shared with another session's checkout.
- No AI provider was called: the narrator's prose in a recap was not read. The browser servers use
  the template and the local stand-in.
- Not run on a deployment, in the native apps, or on a real TV; the TV was a browser window at TV
  sizes. No human has played it: play acceptance is the owner's.
- From the UX pass, left open: English says "Last time" on the TV's join card and "Previously…"
  elsewhere (Russian says «В прошлый раз…» in both); the start form does not say when no screen is
  paired (the running session's panel does); "Unpair the table's screens" stays ticked by default
  at a session's end, as before this stage — with it ticked, next week's recap has no TV until one
  is paired again. The last is a product call.
- The recap's passages are chosen by the moments' salience; with a narrator's prose, whose
  paragraphs cite several moments each, the choice was tested only on constructed chapters.

## For the owner

- Rollback: a build from before this stage cannot read a chapter written with a session; once one
  exists, going back needs a restore or a build of this stage (ADR 0071, Consequences).
- The DM's line is the heart of the recap: with the template (no AI keys) each moment is one plain
  sentence, and "Previously…" reads as three of them.
- Play acceptance is the owner's: close an evening, read the recap on a phone, open the next one
  with the TV.
