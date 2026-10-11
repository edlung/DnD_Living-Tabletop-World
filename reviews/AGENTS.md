# Independent Reviews

New reviews use Opus 5.5 xhigh in a fresh session (owner decision 2026-10-11).
Historical Astra reports remain unchanged; follow `docs/PROJECT_WORKFLOW.md` and `CHECKPOINTS.md`.

Historical gate reports and their reproduction evidence. Read the exact report named by the current handoff; do not load this directory wholesale.

- Preserve initial reports and previous retests. Retests use the next numbered report under `AGENT_WORKFLOW.md`.
- Evidence under `evidence/gate-<NN>/` belongs to that gate only. Start with the report and `results.json`; open an individual probe recipe only to reproduce its checks.
- These are review artifacts, not application implementation. Run probe recipes from the repository root and observe each recipe's database requirements.
