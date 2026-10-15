> Current owner policy (2026-10-15): one session, one model. `docs/PROJECT_WORKFLOW.md` controls new work.
> The model selected in the session plans, implements, verifies and reports; no orchestrator, no
> separate writer/reviewer roles, no model or effort pinning. Older assignments are historical.

# Model & Effort Matrix — v1.5 (historical)

Since 2026-10-15 the model selected in the session does all the work and effort is the session's
choice. The tables below record historical assignments and suggestions only; they pin nothing.

| Stage | Model | Effort | Reason / Next |
|---:|---|---|---|
| 0 | Claude Opus 5.5 | HIGH | Stable default; repository foundation |
| 10 | Claude Opus 5.5 | HIGH | World kernel |
| 20 | Claude Opus 5.5 | **MAX** | Knowledge boundary → **Astra Gate 01 / MAX** |
| 30 | Claude Opus 5.5 | HIGH | Memory/timeline |
| 40 | Claude Opus 5.5 | HIGH | Deterministic rules |
| 50 | Claude Opus 5.5 | HIGH | Context Engine |
| 60 | Claude Opus 5.5 | HIGH | Investigation vertical |
| 70 | Claude Opus 5.5 | **MAX** | Epistemic/contradiction integrity → **Astra Gate 02 / MAX** |
| 80 | Claude Opus 5.5 | HIGH | Combat engine |
| 90 | Claude Opus 5.5 | **MAX** | Reaction/state concurrency → **Astra Gate 03 / MAX** |
| 100 | Claude Opus 5.5 | HIGH | AI gateway only; no mutation |
| 110 | Claude Opus 5.5 | **MAX** | Canonical AI mutation boundary |
| 120 | Claude Opus 5.5 | **MAX** | Continuity constraints |
| 130 | Claude Opus 5.5 | **MAX** | NPC knowledge isolation → **Astra Gate 04 / MAX** |
| 140 | Claude Opus 5.5 | HIGH | Relevance ranking; rules remain authority |
| 150 | Claude Opus 5.5 | HIGH | Asset identity |
| 160 | Claude Opus 5.5 | HIGH | World visual state |
| 170 | Claude Opus 5.5 | HIGH | Chronicle |
| 180 | Claude Opus 5.5 | **MAX** | Full integration → **Astra Gate 05 / MAX Full Red Team** |
| 190 | GPT-6 Astra | **MAX** | Gate 05 review of Stage 180; no Opus implementation work order |
| 200 | Claude Opus 5.5 | HIGH | UX foundation after Gate 05 PASS |
| 210 | Claude Opus 5.5 | HIGH | World as Interface |
| 220 | Claude Opus 5.5 | HIGH | Combat UX using existing domain contracts |
| 230 | Claude Opus 5.5 | HIGH | DM authoring UX using validated commands |
| 240 | Claude Opus 5.5 | HIGH | Product validation and usability evidence |
| 250 | Claude Opus 5.5 | HIGH | Vertical slice release |
| 290 | Claude Sonnet 5.5 | **MAX** | Language enters canonical history; reviewed Chronicle and recall rules change |
| 300 | Claude Sonnet 5.5 | HIGH | Live AI behind the existing gateway; no new mutation path |
| 310 | Claude Sonnet 5.5 | **MAX** | Change signal is a new knowledge-boundary surface; DM acts for an absent player |
| 320 | Claude Sonnet 5.5 | HIGH | Visual language; presentation only |
| 330 | Claude Sonnet 5.5 | HIGH | Real images behind the existing image port |
| 340 | Claude Sonnet 5.5 | **MAX** | Production authentication boundary |
| 350 | Claude Sonnet 5.5 | HIGH | Deployment → **fresh Opus Gate 06 / XHIGH Full-Stack Red Team** |
| 355 | Claude Opus 5.5 (fresh review session) | **XHIGH** | Gate 06 review of the deployed build; review only |
| 360 | Claude Sonnet 5.5 | HIGH | Human playtests and the v0.1 release |

## Model Exceptions

Stages 200–250 ran under owner exceptions recorded in their reports (a GPT model for Stage 200, Claude Sonnet 5.5 for Stages 210–250). From Stage 290 on, the builder is Claude Sonnet 5.5 (owner decision, 2026-10-05, after its results in Stages 210–250); the owner changes this matrix before a stage starts when a different builder model or effort is wanted; a stage does not start under an unrecorded exception. Reviewer independence is enforced by separate fresh sessions; no implementation session approves its own checkpoint.

## Remediation Rule

A Critical/High finding or a violated invariant: add a failing regression first, fix the root contract,
re-run affected and prior checks, record the finding-to-fix evidence and stop. Medium/Low findings follow
the owner's disposition. Do not silently bypass blocking invariants.

## Context/Cache Practicality

The workflow intentionally minimizes routine effort changes. Keep the same Claude Desktop project/session when practical and let repository documents carry durable state. Opus review remains a fresh session separate from implementation.

## Golden Rule

**A stage is accepted by the owner, never by the session that built it. Run every check, attack your own change, report honestly, and stop at the checkpoint.**
