# Stage 290 — Language foundation and Russian Ravenford

- Date: 2026-10-05 (Europe/Oslo).
- Status: **IMPLEMENTED; OWNER ACCEPTANCE PENDING.** Per `AGENT_WORKFLOW.md` (Product Acceptance) the
  stage is complete only after the owner plays the Russian flows on this build.
- Work order: `work-orders/OPUS_STAGE_290.md`. Builder: Claude Sonnet 5.5 (owner decision, `EFFORT_MATRIX.md`).
- Decisions: ADR 0031. Owner choices of 2026-10-05: transliterated names; wording without declension.

## What changed

| Area          | Change                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campaign      | `CreateCampaign.language` → `CampaignCreated.language` (additive; absent = English) → `CampaignState.language`; shown in the session view.                                                                                                                                                                   |
| Recorded text | Memory summaries (conversation, evidence shown, examination, Detect Magic), Insight statements, contradiction explanations, Chronicle entries, memory suggestions, and session view names are written in the campaign language at decision time (`packages/domain/src/language/`). Replay reads stored text. |
| Rules         | Chronicle hedging has Russian stems with Unicode word boundaries; memory recall reduces Russian word forms to stems (English tokens unchanged).                                                                                                                                                              |
| DM text       | Authoring risk reasons, continuity warnings/issues, resolution options, and the "also known as" description follow the language (`say.ts`, `authoring-ru.ts`).                                                                                                                                               |
| AI            | Prompts state the output language; the offline interpreter reads documented Russian phrasings; local NPC replies and Chronicle prose are Russian.                                                                                                                                                            |
| Seed          | `fixtures/ravenford-ru/` (same IDs; glossary in `GLOSSARY.md`), with Russian boundary specifications.                                                                                                                                                                                                        |
| Client        | Dictionary keyed by English source strings (`@ltw/ui` `i18n.tsx`, `ru.ts`, `apps/web/src/i18n/ru.ts`); language follows the campaign; a test fails on any missing entry or placeholder drift.                                                                                                                |

## Evidence

Final `pnpm validate` on this revision: exit 0 — format, lint, typecheck, context-budget (595 files, none over target), unit 169 files / 1,629 tests, build, migrate, seed, integration 21 files / 78 tests, E2E 45 Chromium journeys (41 earlier English journeys unchanged, 4 Russian). New suites: Russian scenario over HTTP and
on PostgreSQL across a restart; Russian Gate 01/02/04 boundary suites (42 tests); language catalog,
hedging, recall, offline-interpreter, and dictionary-coverage tests; four Russian browser journeys that
fail on any English word left on screen (player asks Mira; DM authors Tomas; Counterspell window; DM time,
weather, and chapter). All existing English suites pass unchanged.

## Boundaries changed for Gate 06

Lexical memory recall (ADR 0010) and Chronicle hedging (ADR 0024). Both are named in
`docs/GATE_COVERAGE.md` for the Gate 06 handoff. Nothing else reviewed by Gates 01–05 changed.

## Limitations (honest list)

- **Owner acceptance has not happened.** Nobody has read the Russian wording as a player or DM.
  Declension-free sentences read stiffly by design (ADR 0031 §5); the owner may want some rewritten.
- Rejection messages, error codes, and logs stay English (ADR 0031 §6). Where the authoring pipeline
  forwards a developer rejection message to the DM (rare error paths), it is English.
- A creature the player does not know shows its ID (`goblin-shaman`) in the reaction prompt, as in English.
- The prompt's world-time line for AI providers is English ("Day 1 10:00:00"); only the output language is set.
- The Russian offline interpreter understands a short documented list of phrasings, not free speech.
- Live-model quality in Russian is not measured; that is Stage 300.
- Russian stemming is a bounded suffix list, not a morphological analyser: some forms (for example
  «ушёл»/«ушла») are not unified.
- Hosted CI has not yet run on this branch; the results above are from the local run.

Stop here; Stage 300 requires explicit owner authorization.
