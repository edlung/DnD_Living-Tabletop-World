# Work Order — Stage 710: "Previously…" and the evening's chapter

**DRAFT — not authorized.** Program `docs/MEMORY_RITUAL_PLAN.md` (Part 1, decisions 8–11), owner's
answers `reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`. Implementation starts only on the owner's
word; the branch starts from `main` after PR 36 (the eleven red journeys) has merged. ADR 0071 §1 is
written first, with the amendments of ADR 0024, 0042 and 0043 it names.

## Why

Read in code on main `9881a3e8`:

- A chapter told from the Party — the writer's default — is listed only to a reader whose perspective
  is exactly `PARTY` (`packages/domain/src/chronicle/views.ts` `chronicleChapters`). A player's book
  reads with the player's own `CHARACTER:` perspective (`apps/web/src/world/world-overlays.tsx`), so
  the party's chapter is on the TV and in no player's book.
- The writer (`apps/web/src/chronicle/generate-chapter.tsx`) always sends `from: 0` and proposes the
  title "Chapter I — Shadows on the Trade Road" in every campaign.
- The server's memory suggestions (ADR 0024 §6) have no screen.
- "Last time" exists only on the TV's join screen (`apps/web/src/display/cast-views.tsx` `JoinCast`).

## Deliver

1. **The party's chapters in every member's book** (710a). The book lists the reader's own chapters
   and the party's (read as PARTY, which a player may take), the party's marked as such; the DM's
   book is unchanged. The writer proposes the last session's title, or "Session N", never a fixed one.
2. **Close the evening** (710b). On the Session sheet, ending a session becomes three short steps
   the DM may skip one by one:
   - _the evening's moments_ — the suggestions for the Party inside this session's window, each
     ticked or not, and one line of the DM's own; every kept moment is a `RecordMemory` command the
     World Engine checks, sent while the session is still open so the memory carries its session; a
     refused one is named and left out;
   - _the end_ — `EndSession` with today's options (screens unpaired, guest seats freed);
   - _the chapter_ — `POST …/chronicle` told from the Party, from the session's start to its end,
     titled as the session; the sheet says which prose the chapter holds (ADR 0032, C) and that undo
     beneath a standing chapter is refused until the chapter is undone.
     A step that fails leaves the earlier ones standing and says so. With nothing kept there is no
     chapter, and the sheet says why.
3. **"Previously…"** (710c). One component reads the newest party chapter (as PARTY): its title, the
   picture of its first entry's place as the party saw it then, at most three paragraphs, "Read on"
   into the book.
   - A player, while no session is open: the card under the lobby banner, beside "I am ready" — also
     for the player who was absent.
   - The DM's start form: "Open with “Previously…”" (on when a party chapter exists) casts it as the
     session starts and shows the DM the same words to read aloud.
   - The table's screen: the `chronicle` cast shows the card; online it opens every player's Table
     screen as that cast does today (ADR 0044 §5). The join screen's recap uses the same component.
4. **The record** (710d): journeys, audits, `docs/AI_CONTEXT_MAP.md`, `docs/GATE_COVERAGE.md`,
   the report `reports/STAGE_710_COMPLETION.md`.

## Design notes

- No migration, no new table and, as read today, no new route: `GET …/chronicle/suggestions` takes
  `scope`, `from` and `to`; `POST …/chronicle` takes `from` and `to`; `GET …/sessions` gives a
  session's start and end in world time; `GET …/chronicle?perspective=PARTY` is open to a player.
  A server change found necessary is designed in the ADR before it is written.
- The window is world time. A moment at the very instant the previous session ended can be told in
  both chapters; the domain test pins what happens and the ADR says which is intended.
- The card keeps nothing in browser storage (`apps/web/AGENTS.md`): it shows while the lobby says no
  session is open, and where the DM casts it.
- `dm/session-sheet.tsx` is 420 lines: the end's steps go to a file of their own before it grows.
- Pictures are read for the time they were chosen for (`withPictureTimes`, Gate 06).

## Boundaries

No stars and wishes (Stage 720), no next date (730), no printable book (770). No change to what a
chapter is, how its prose is checked, or who may write one. No AI call beyond the chapter's existing
narrator; no paid call in any test. A DM-told chapter is never listed, cast or carded for anyone but
the DM. Nothing is deployed; merging is the owner's word.

## Checks

- Domain: suggestions bounded by a session's window; a chapter of a session's window; the boundary
  instant between two sessions.
- HTTP: a player reads the party's chapters and no DM-told chapter; a display's reads unchanged; a
  stranger reads none.
- Client units: the book's merge and marks, the end's steps and their failures, the title proposed.
- Journeys (Chromium and WebKit): the DM closes an evening with two moments and a line of their own,
  the chapter is in both players' books and on the TV; next time the absent player reads the card,
  the DM opens with "Previously…", the TV and an online player's Table screen show it; an evening
  with nothing kept.
- `ui-layout-audit` at 1440, 768 and 390, light and dark, Russian and English, every changed screen
  and the TV; the UX passes (task walkthrough, copy, accessibility) for the end's steps and the card.
- Format, lint, typecheck, context budget, unit and integration tests, build; an adversarial pass
  against invariants 4, 5 and 19 recorded in the report.

## Done

The report with what was and was not verified, the handoff `AWAITING_OWNER_DISPOSITION`, a pull
request into `main`. Stage 720 does not start without the owner's word.
