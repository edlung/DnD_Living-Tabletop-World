# Model & Effort Matrix — v1.2

## Operating Rule

**Claude Opus 5.5 / HIGH is the stable default for the entire build.**

Do not switch effort merely because a new ordinary stage begins. Switch Opus to **MAX only for the architecture-critical stages listed below or for Critical/High Astra remediation**.

**GPT-6 Astra always runs checkpoint reviews and retests at MAX.**

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

## Remediation Rule

Any Astra **FAIL** containing a **Critical or High** finding:
1. switch/keep Claude Opus 5.5 at **MAX**;
2. add a failing regression test first;
3. fix the root architectural cause;
4. write the remediation artifact;
5. stop;
6. switch to **GPT-6 Astra / MAX** for retest.

For Medium/Low-only findings, follow the gate report and project-owner decision; do not silently bypass blocking invariants.

## Context/Cache Practicality

The workflow intentionally minimizes routine effort changes. Keep the same Claude Desktop project/session when practical and let repository documents carry durable state. Astra remains a separate independent review context by design.

## Golden Rule

**No model approves its own checkpoint.**
