# Work Order — Stage 730: The next game

Authority: the owner's word of 2026-11-15, «не спрашивай меня, а действуй по плану до конца», and
the answer «Дата + файл календаря» (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); program
`docs/MEMORY_RITUAL_PLAN.md` (Part 1); ADR 0071 §3, written with the stage. Branch
`claude/stage-730-next-game`, stacked on Stage 720's branch (PR 39, not merged): the lobby's stars
card it sits beside is there.

## Deliver

1. **The date**: an instant and an optional line of 120 characters in the table's state (migration
   0041, additive). The DM alone sets, changes and takes it away; every member and a table display
   read it.
2. **Where it is read**: a line in the lobby while no session is open, the hub's campaign card, the
   join screen of the table's screens, the DM's Session sheet with the form — each in the reader's
   own time zone and language, with how many days are left.
3. **The calendar file** for every member: the campaign's name, the instant, the DM's line,
   reminders a day and an hour before, a stable UID so a changed date replaces the event.
4. **When it stops**: shown through its own evening; cleared by the session it was set for.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- A date is past six hours after it began, and one that could not be shown is not set; the session that starts within twelve hours of it
  clears it, a date for a later day stays (the plan: "a date that passed, or a session's start,
  clears it" — an extra evening in between should not lose the date).
- No end time is kept (the plan allowed an optional one): a calendar's event lasts three hours.
- One line in the lobby beside the stars card instead of a second copy on the card.
- The link to the file is offered to a browser signed in by its cookie, not in the native shells
  (Stage 750 lets them hand a file over) and not where sign-in is a typed token.
- The file is sent inline, not as a download, so a phone's browser may offer its own calendar
  (not tried on a real phone).
- The glyph is the kit's `day-counter`.

## Boundaries

No reminders from the server, no push, no e-mail; no attendance or answers; no recurring dates; no
agreement (740). Nothing canonical; no AI call. The migration is additive. Nothing is deployed;
merging is the owner's word.

## Checks

- Unit: when a date is shown and settable; the file's lines, escapes and folding, with an
  injection attempt; who sets and reads over HTTP, the file per role; the hub's card; the words in
  both languages.
- Integration: PostgreSQL holds the date and its limits.
- Journeys: `next-game.spec.ts` (Chromium, WebKit on an iPad), `next-game-file.spec.ts` (the saved
  file, the hub, the TV).
- `ui-layout-audit` at 1440, 768, 390, 320 and 832×400, both languages, and the TV sizes; an
  independent UX pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e suite;
  an adversarial pass recorded in the report.

## Done

`reports/STAGE_730_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 720's.
