# 0029. DM authoring UX: preview, edit, confirm, cancel, undo

- Status: Accepted
- Date: 2026-10-05
- Stage: 230 only
- Decision type: technical; implements ADRs 0017, 0018, 0019. The two UX choices below
  were put to the owner and taken as recommended.
- Owner approval: the owner authorized Stage 230 and directed this session (Claude
  Sonnet 5.5) to carry it out instead of Opus 5.5/HIGH. The exception does not change the
  matrix for later stages or independent gates.

## Context

The authoring pipeline exists end to end on the server: `POST ai/intents`, stored
proposal revisions, previews with issues, warnings, options and risk, the commit consent
gate, and undo with blockers. Stage 230 adds the DM's screen for it. It adds no route,
contract, rule, or provider.

## Decisions

1. **One flow, existing routes only.** `apps/web/src/authoring/` calls `ai/intents` →
   `authoring/proposals` → `…/revisions` → `…/commit` → `…/undo`, and `commands` for an
   explicit `UndoCommand` of a blocker. The browser never calls a provider.
2. **The server's preview is the screen.** Summary, plain-language commands, risk and its
   reasons, blocking issues, warnings, notes, and the events a commit would record are
   displayed exactly as returned. Each issue and warning shows the server's resolution
   options, applied only by the DM as a new revision.
3. **Editable fields (owner choice):** name, description, location, what the NPC saw, and
   whether they will tell it (`SetDisclosure` WILLING). An edit composes new commands and
   stores a new revision; the preview and confirmation are recomputed and every earlier
   acknowledgement is discarded. Other proposal shapes are changed by describing them
   again.
4. **One explicit confirmation (owner choice).** "Confirm and add to the world" is enabled
   only when the preview is committable and every listed warning is accepted; it sends the
   server-computed risk level and the accepted warning keys. The consent gate in the World
   Engine remains the authority and may still refuse.
5. **Stale and refused submissions never look committed.** A `409` or a rejection shows a
   fixed message, reloads the proposal, and leaves the world as the server holds it. The
   client keeps the HTTP status of refusals so a conflict is not mistaken for a lost
   response; after an interrupted response it reloads rather than guessing.
6. **Cancel is local.** There is no cancel route. Cancelling discards the screen's copy;
   the stored draft is DM working data and never canonical.
7. **Undo.** The safe undo is one button. When the server refuses with `UNDO_UNSAFE`, the
   named blockers are listed, each with an explicit "Undo … first" action; nothing is
   erased silently and the DM retries the undo afterwards.
8. **Secrecy.** The panel renders only in the DM perspective and keeps proposals, previews,
   and the NPC's private account in component memory. A perspective change remounts the
   world, so a Player or character preview holds none of it; nothing is written to browser
   storage. The authoring session survives world refreshes (it sits outside the loading
   state) so a commit does not discard the screen that made it.
9. **Test provider.** The browser-test server routes the `reasoning` capability to the
   deterministic offline interpreter (ADR 0017 §2); no external provider runs.

## Test isolation

Each authoring journey owns a campaign cloned from the authorized Ravenford script
(`apps/server/src/testing/ui-authoring-campaigns.ts`,
`tests/e2e/fixtures/authoring-campaigns.json`). Nothing pre-authors Tomas.

## Consequences

No dependency edge, contract, canonical mutation path, or reviewed projection changed, so
no gate is reopened. The shared client's `post` now preserves a refusal's HTTP status
(it was collapsed to "interrupted"), which also lets the action hook's existing 4xx branch
work as written. Asset approval, clue authoring, and multi-NPC proposals are out of scope.

## Amendments

- 2026-10-28 (owner decisions 11, `reviews/OWNER_DECISIONS_11_2026-10-28.json`; evidence
  `reports/evidence/stage-360/ai-stand-in/dm/notes.md` steps 08–09, 17–19, 30):
  - **SI-D1, drafts survive a reload and a perspective switch (replaces §6, keeps §8).** The
    DM's client reads the open drafts (`GET …/authoring/proposals`, ADR 0018 amendment
    2026-10-28) when the DM view mounts — a reload, or a switch back to the DM — and shows the
    newest with "Your unfinished proposal was restored.", unless the DM has already started
    another. No paid interpretation is repeated. Cancel is now the server's (`…/cancel`), so a
    discarded draft never returns. Nothing is written to browser storage; a lower perspective
    reads nothing. The session hook moved from the DM sheets to the world screen, which a
    perspective change still remounts.
  - **SI-D8, the DM edits an NPC from its card.** In the DM perspective an NPC's details show its
    recorded description ("Description (DM)", from the DM's lineage) and "Edit name and
    description". Submitting stores a DM-written proposal of one `UpdateEntityProfile` with only
    the changed fields and opens it under Add to the world: the same preview, who-sees (players
    who know the NPC see the new name; players never read the description), confirm, and
    History undo. One proposal at a time: while a draft is open the form says so and offers to
    show it. The proposal editor also edits such a proposal's name and description.
  - **SI-D7, a witness's past.** A `WITNESS_ELSEWHERE` warning shows "Edit the description",
    which opens the proposal's editor with the description focused when the proposal creates
    the witness, or the NPC's card when the witness is already in the world. No option moves
    the witness (ADR 0019 amendment 2026-10-28).
