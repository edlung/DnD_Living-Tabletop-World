> Current owner policy (2026-10-11): `docs/PROJECT_WORKFLOW.md` controls new work.
> Architecture: Astra/Fable xhigh. Implementation: Opus medium; review repairs xhigh.
> Acceptance: fresh independent Sol/Opus xhigh. Orchestration: Sol medium.
> Older model assignments are historical; preserve their evidence, not their future authority.

# Independent Reviews

Use `docs/PROJECT_WORKFLOW.md` for current role identities, efforts and dual-review gates.
Historical review assignments and evidence remain unchanged.

Historical gate reports and their reproduction evidence. Read the exact report named by the current handoff; do not load this directory wholesale.

- Preserve initial reports and previous retests. Retests use the next numbered report under `AGENT_WORKFLOW.md`.
- Evidence under `evidence/gate-<NN>/` belongs to that gate only. Start with the report and `results.json`; open an individual probe recipe only to reproduce its checks.
- These are review artifacts, not application implementation. Run probe recipes from the repository root and observe each recipe's database requirements.
