# Stage 210 — World as Interface

- Date: 2026-10-05 (Europe/Oslo).
- Status: **COMPLETE**. Stage 220 is not authorized or started.
- Work order: `work-orders/OPUS_STAGE_210.md`.
- Starting revision: `d8f3ded` (Stage 200 committed as `a36ba3f`).
- Model exception: the owner told this session (Claude Sonnet 5.5) to proceed
  instead of Opus 5.5/HIGH. Later model/gate requirements are unchanged.
- Technical decision: `docs/adr/0027-world-as-interface.md`.

## Provenance (read this)

Most Stage 210 code (`apps/web/src/exploration/`, investigation journeys,
`ui-investigation-campaigns.ts`) was written at the end of the Stage 200 session,
before Stage 210 was authorized, and was committed inside `a36ba3f` with its
final fixes. The Stage 200 report still says those interactions were not
implemented; that statement is superseded by this report. In this stage the
work was audited against the deliverables, the broken parts were repaired
(`a36ba3f`), and ADR 0027, context maps, and gate coverage were written.

## Delivered

- Market Square is the default arrival scene; Mira, the Missing Caravan, and the
  investigation objects are reached by selecting objects, with no quest or NPC menu.
- "Ask about Merchant Guild caravan" appears only after the server lists it for a
  character who knows the concept (unknown-concept journey proves both states).
- Inspect/Investigate on site objects, typed evidence/testimony/hypothesis/
  contradiction display, Orin symbol interaction after showing evidence, and
  scoped memory recall through the world context.
- Arrival keeps the entered place selected; non-adjacent known places stay
  reachable under "Known destinations"; full sheets and all options remain in
  disclosure panels.
- Interrupted responses retry the same `commandId` (one hypothesis recorded);
  late results cannot restore a stale object, session, or memory list.

## Validation gate

| Gate item                             | Evidence                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Arrival/investigation journey E2E     | `investigation-journey.spec.ts` — PASS                                         |
| Knowledge-dependent action visibility | unknown-concept journey (absent, then present after learning) — PASS           |
| No hypothesis-to-fact promotion       | journey asserts server type `HYPOTHESIS` before and after contradiction — PASS |
| No hidden-data leakage                | `investigationBoundary` scans DOM and all API bodies for `NEVER_FOR_PLAYERS`   |
| Authorized detail access              | details/sheet journeys in `details-and-scenes.spec.ts` — PASS                  |

## Commands (final tree)

| Check                   | Result                                                 |
| ----------------------- | ------------------------------------------------------ |
| `pnpm validate`         | PASS (exit 0): format, lint, typecheck, context-budget |
| `pnpm test`             | PASS, 157 files / 1,541 tests                          |
| `pnpm test:integration` | PASS, 20 files / 77 tests                              |
| `pnpm test:e2e`         | PASS, 23 Chromium journeys                             |
| context-budget          | 533 active files; zero over 500 or 700 lines           |

Bundle: `assets/index-qenmz_Ni.js` SHA-256
`3e3fe33b8fd042b6459bafc97b765accccfd5c79a8a20607e11b602bfd91e63c`;
`assets/index-Dj3sb0KJ.css` SHA-256
`488b6a1189dfee31a0bb5e25d7c9cfef5fd187eb30e6825ac8faf3074f33009a`.

## Limitations

No live AI runs; scripted d20 results of 15; no live event subscription (explicit
world refresh); combat/reaction options remain read-only (Stage 220); authoring
is Stage 230; production authentication remains undecided. Hosted CI was not
executed remotely. Unit tests cover the command mapping only; interaction
behavior is covered by the browser journeys.

Stage 210 is complete. Stop here; Stage 220 requires explicit owner authorization.
