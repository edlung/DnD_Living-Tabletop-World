# Formal Gate Missions (legacy filename)

Owner decision 2026-10-11: future reviews, including Gate 06, are performed by
Opus 5.5 xhigh in a fresh session. Historical Astra missions/reports are preserved.
Use `docs/PROJECT_WORKFLOW.md` and `CHECKPOINTS.md` for current assignments/output names.

Use these mission statements together with `ASTRA_MASTER.md`, the generated handoff request, and `ASTRA_REVIEW.md`. Effort: **MAX** for every formal gate.

## Gate #1 — Knowledge Boundary (after Stage 20)
Objective: recover DM/WORLD_TRUTH secret information through Stage 20 query/projection surfaces using unauthorized PLAYER, PARTY, PUBLIC, and MIRA fixture perspectives, malformed/missing scopes, relations, serialization, errors, and any existing fallbacks/caches. Passing requires that indirect routes fail as well as direct routes. MIRA is an NPC scope fixture, not runtime dialogue. Record memory retrieval and LLM dialogue as future surfaces under `docs/GATE_COVERAGE.md`, with mandatory tests/review when introduced.

## Gate #2 — Contradiction / Knowledge Integrity (after Stage 70)
Review the Stage 30 memory and Stage 50–60 context/investigation paths as well as contradictions, per `docs/GATE_COVERAGE.md`. Objective: make testimony/hypothesis become fact without a valid transition; infer a liar without sufficient evidence; cross-contaminate NPC knowledge; or obtain secret truth through contradiction/explanation paths.

## Gate #3 — Reaction Integrity (after Stage 90)
Objective: double-spend reactions, use expired/stale reaction windows, react after trigger resolution, race concurrent reactions, exploit replay/event ordering, or produce inconsistent rollback while a reaction window exists.

## Gate #4 — NPC Isolation (after Stage 130)
Include the integrated Stage 100–120 AI context/authoring/continuity surfaces from `docs/GATE_COVERAGE.md`. Objective: prompt-inject/jailbreak NPCs for DM truth, hidden/system context, omniscience, other-NPC private knowledge, future events, or campaign secrets. Passing requires architectural context isolation: forbidden information should not have been supplied to the NPC context in the first place.

## Gate #5 / Stage 190 — Full Ravenford Red Team (after Stage 180)
Objective: break Ravenford across knowledge, permissions, timeline, rules, state mutation, event ordering/replay, concurrency, rollback, NPC isolation, AI hallucination, continuity, provenance, asset identity, and world-history reconstruction. Run two passes: (A) invariant-directed attacks; (B) emergent attacks not suggested by the predefined list.

## Gate #6 / Stage 355 — Full-Stack Red Team (after Stage 350)
Review the deployed build and every surface introduced since Gate #5, per `docs/GATE_COVERAGE.md`, including the client built in Stages 200–240, which no gate has reviewed. Objective: sign in or act as someone else, keep access after revocation, or cross campaigns; obtain another perspective's data through the browser (DOM, storage, caches, history), the change signal (content, timing, or existence of changes a perspective may not read), or images; make a live model reveal, invent as fact, or commit anything it must not, in Russian and in English; break the language-dependent rules changed at Stage 290 (Chronicle hedging, memory recall, replay of histories earlier revisions wrote); exhaust or bypass AI and image cost limits; and lose or alter canonical history through backup and restore. Run two passes: (A) invariant-directed attacks; (B) emergent attacks not suggested by this list. Passing requires that isolation holds by construction: forbidden information is absent from what each client, signal, prompt, and image request receives.
