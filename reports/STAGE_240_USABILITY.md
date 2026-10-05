# Stage 240 — Product validation: usability session

- Date: 2026-10-05 (Europe/Oslo).
- Status: **INCOMPLETE against the gate. No real human uncoached session has been held.**
  An exploratory pass by **AI stand-in participants** was run at the owner's instruction
  ("take the participants yourself") and is recorded below. It is **not** a human usability
  session and is **not** acceptance. Findings await owner disposition.
- Work order: `work-orders/OPUS_STAGE_240.md`.
- Build: revision `4c0ce49` (Stage 230 `ccae57f` + the bounded remediation below), Vite dev
  server on the browser-test API server (`apps/server/src/testing/ui-server.ts`), scripted
  d20 results of 15, deterministic offline interpreter for AI features, dev persona tokens.
- Model exception: the owner told this session (Claude Sonnet 5.5) to proceed instead of
  Opus 5.5/HIGH. Later model/gate requirements are unchanged.

## Owner decisions this report follows

1. Remediate the missing UI on Sonnet 5.5 (done, below).
2. "Take the participants yourself": real people are unavailable to this agent, so the
   participants are separate AI agents. Their limits are stated below; they cannot stand in
   for human behaviour, so the human-session requirement of `EFFORT_MATRIX.md` stays open.
3. The owner evaluates the result (this report).

## Remediation done before the pass (bounded; the three gaps from the first report)

| Flow                              | Added                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Day 2 return, DM time and weather | DM "Time and weather" controls; readable world time ("Day 2 · 10:00") in the scene header          |
| Chronicle and minimal flashback   | Chronicle panel (cited entries with epistemic types, "Open flashback"), DM "Write a chapter"       |
| DM performs an NPC                | DM "Perform <NPC>" over the existing dialogue route; words labelled "Spoken, not a recorded fact." |

Commit `4c0ce49`; three new E2E journeys (`tests/e2e/dm-tools.spec.ts`); no server, rules, or
contract code changed.

## Method of the AI stand-in pass (conditions and limits)

- Two fresh agents, each given only neutral task prompts with no feature names, browser tools
  only (no repository, shell, API, or page source), no facilitator help. Player agent:
  campaigns `ui-session-player`, `ui-session-turn`, `ui-session-window`. DM agent:
  `ui-session-dm`, `ui-session-player`, `ui-session-window`. Raw notes, as delivered:
  `reports/evidence/stage-240/session-player.md`, `session-dm.md`.
- **Limits.** They are language models, not people: their navigation, patience, and reading
  differ from human behaviour. The player agent wrote its notes after the run from its action
  log. Screenshots lagged one step and a form field did not always register (the DM agent
  suspects its own tooling for early sign-in failures). Roughly 45 (player) and a few hundred
  (DM) browser actions.
- **Protocol flaw (mine).** The DM agent's Phase 3 reused `ui-session-window`, whose
  Counterspell window the player agent had already answered. The DM therefore did not meet the
  intended "spell waiting for an absent player" condition, and its Phase 3 findings do not test it.
- Observations below are the agents' own reports, not independently reproduced by me unless noted.

## Observations (agent-reported; interpretation kept apart)

**Player agent.** Phase A, reached with some difficulty: asked Mira about the caravan through
the scene (no NPC menu), traveled to the Old Trade Road, inspected and investigated site
objects, recorded a hypothesis; did not follow the North Gate lead. Phase B, reached with
difficulty: selected a goblin on the grid, chose Fireball, End turn; then saw "Turn:
goblin-shaman" and nothing further. Phase C, reached: answered the Counterspell card.

**DM agent.** Phase 1: added the guard through the authoring panel (a first, longer wording
was not understood by the offline interpreter), edited, confirmed, checked Elowen and Public
views (nothing of him). Could not speak as him ("cannot speak with this character now", no
reason) because the player character was elsewhere; the undo control was lost after changing
perspective. Phase 2, reached unaided: advanced to Day 2, set weather, wrote and viewed a
chapter. Phase 3: see protocol flaw; reached "End encounter" without confirmation.

## Candidate defects and friction (for owner disposition; severity is my interpretation)

| #   | Finding (source)                                                                                                                                                      | Reproducible by design / code?                                                                    | Suggested weight |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Action results appear at the top of a long page, away from the click (player)                                                                                         | Yes — notice renders in the page header                                                           | High (feedback)  |
| 2   | "Explore <place>" selects a place; travelling needs a second "Enter" action; "Unidentified location" wording (player)                                                 | Yes — Stage 210 design (ADR 0027)                                                                 | Medium           |
| 3   | After End turn, no waiting indicator; creatures wait for the DM, so a lone player sees a stall (player)                                                               | Yes — by design (creature turns are DM-run), nothing tells the player                             | High (flow)      |
| 4   | Combat feedback lacks rolls and damage; Hunter's Mark says "resolved without new evidence" (player)                                                                   | Yes — `outcome-messages.ts`; Healing Word is offered on any combatant because the server lists it | Medium           |
| 5   | Reaction card does not name the spell or say what Ignore does (player)                                                                                                | Partly intended: the spell is the caster's secret (ADR 0016)                                      | Medium (copy)    |
| 6   | "Speak as NPC" refusal gives no reason; free-text line has no visible effect; subject list stale (DM)                                                                 | Yes — `perform-npc.tsx` shows one generic refusal text                                            | High (DM)        |
| 7   | Undo of an authoring commit is only on the proposal card and is lost on perspective change or reload (DM)                                                             | Yes — chosen in ADR 0029 §8 (secrecy); no proposal list exists                                    | High (DM)        |
| 8   | In combat the DM cannot act for or skip an absent player; token clicks show a generic error; "End encounter" has no confirmation (DM)                                 | Partly — DM has no acting character; End encounter is unguarded                                   | Medium           |
| 9   | Jargon and generic errors (`AskAbout`, `EntityCreated`, "not available in the current view") (DM)                                                                     | Yes — raw command and event type names in the review                                              | Medium           |
| 10  | Stale controls: weather select stays on "rain" after setting fog; advance button unchanged; chapter lines repeated; raw timestamps ("OBSERVATION · -17366400") (both) | Yes — local state and unformatted times in existing components                                    | Low–Medium       |

Object-first interaction: the player agent reached Mira, the site, and the combat target by
selecting objects in the scene or on the grid and did not need a quest or NPC menu; its
friction was in feedback and travel wording, not in finding objects. This is one agent's
behaviour and says little about people.

## Acceptance status against `RAVENFORD_SPEC.md`

| Step                                                                     | Evidence                                                                                 | Status                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Find Mira without an NPC menu; caravan; investigate; contradiction; Orin | E2E journey; player agent (Mira, objects; Orin/contradiction not exercised by the agent) | Engineering PASS; human session open |
| Combat with contextual reaction                                          | E2E; player agent (Counterspell chosen blind)                                            | Engineering PASS; human session open |
| Return to a changed Ravenford; Chronicle; flashback                      | E2E; DM agent wrote and viewed a chapter and moved time/weather                          | Engineering PASS; human session open |
| DM creates, previews, edits, confirms Tomas; secrecy; undo; performs him | E2E; DM agent (create/edit/confirm/secrecy; perform and original undo not reached)       | Engineering PASS; human session open |
| Integrity acceptance                                                     | existing integrity suites (1553 unit, 77 integration)                                    | PASS (automated)                     |

## Regression evidence at `4c0ce49`

`pnpm validate` exit 0: 1,553+ unit tests (161+ files), 77 integration tests, 40 Chromium
journeys, context-budget in limits. (Exact counts are repeated in the Stage 250 report.)

## Blockers and owner disposition

- **Gate not met:** a real uncoached human session has not happened. The AI pass cannot
  replace it; the validation gate and Stage 250's usability acceptance stay open.
- **Owner disposition required** for findings 1–10 (fix now / defer / accept), and a decision
  on whether and when a human session is held. No finding has been dispositioned.

Stage 240 is **not** complete. No claim here asserts human usability acceptance.
