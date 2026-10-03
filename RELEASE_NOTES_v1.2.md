# v1.2 Release Notes

- Changed Claude Opus 5.5 operating policy to **HIGH by default**.
- Reduced routine effort switching to protect workflow continuity and simplify manual orchestration.
- Opus MAX is now reserved for Stages **20, 70, 90, 110, 120, 130, 180** and Critical/High Astra remediation.
- GPT-6 Astra remains **MAX for every checkpoint review and retest**.
- Added Desktop-first workflow: **Claude Desktop = builder; Codex Desktop = reviewer**.
- CLI tooling is optional for the first Ravenford vertical slice.
- Product architecture, invariants, stage scopes, and Astra checkpoint locations are unchanged.

## Development Pack preflight corrections — 2026-10-03

- Made `EFFORT_MATRIX.md` the single model/effort authority and added the existing Stage 190 review plus Stages 200–250 to its schedule.
- Consolidated Stage 0 deliverables in `work-orders/OPUS_STAGE_000.md`; the older root entry now redirects there. Product documents remain at the root.
- Standardized Gate 05 / Stage 190 handoff, report, remediation, and numbered retest naming. Reports have only PASS or FAIL results, with separate finding dispositions.
- Clarified that validation/PASS and owner authorization are distinct; preparing this pack does not start Stage 0.
- Added `docs/GATE_COVERAGE.md` to schedule boundary checks as surfaces appear and prevent unsupported early coverage claims.
- Added `docs/IMPLEMENTATION_PREREQUISITES.md` for pending ruleset, temporal/undo, and minimum authoring-validation obligations. Stage 110 includes its required continuity guards; Stage 120 extends them.
- Added bounded work orders for existing planned Stages 200–250, including real usability evidence and release acceptance.
- Added `docs/AI_CONTEXT_MAP.md`, work-order context routing, and Stage 0's automated 700-line context-budget requirement.
- These corrections clarify execution and acceptance responsibilities; they do not change the product blueprint, architecture invariants, or Ravenford scenario, and do not approve pending product ADRs.
