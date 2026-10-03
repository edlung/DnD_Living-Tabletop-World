# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-10-03
- Stage: 0
- Decision type: technical
- Owner approval: not required (technical); the workflow itself is mandated by `work-orders/OPUS_STAGE_000.md`

## Context

The work order requires an ADR workflow under `docs/adr/`. Builder and reviewer models change between stages, so decisions must survive in the repository rather than in chat context. Product decisions and invariant changes need owner approval (`AGENT_WORKFLOW.md`, No Silent Architecture Changes).

## Options considered

1. **Lightweight Markdown ADRs in the repository** — reviewable in diffs, readable by any agent, no tooling.
2. **External wiki/issue tracker** — invisible to agents working from the repository; drifts from code.

## Decision

Use numbered Markdown ADRs in `docs/adr/`, following `README.md` and `0000-template.md`. Each ADR declares its decision type; product decisions and invariant changes stay `Proposed` until the owner approves them.

## Consequences

- Agents read only the ADRs relevant to their task via `docs/adr/README.md`'s index.
- Pending product decisions remain listed in `docs/IMPLEMENTATION_PREREQUISITES.md` until their stage writes the ADR.

## Invariants affected

None weakened. Supports the "No Silent Architecture Changes" rule.
