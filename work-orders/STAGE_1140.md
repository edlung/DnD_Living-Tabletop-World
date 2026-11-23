# Work Order — Stage 1140: closing

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1140); ADR 0075
§14, written with the stage. Branch `claude/stage-1140-closing`, stacked on Stage 1130's.

## Deliver

1. The old shell's styles and dead code removed; the dictionaries cleaned.
2. The full checks and every Chromium journey on the closing branch; the stack carried onto Stage
   1020's last commit so that it merges in order.
3. ADR 0075 §14; `docs/PROJECT_WORKFLOW.md`'s status; the closing report with the acceptance table,
   what each stage left, what was not run, and the order to merge (`reports/STAGE_1140_COMPLETION.md`).

## Boundaries

No command, route, rule or projection changes. Nothing is merged or deployed by the session.

## Checks

Typecheck, lint, format, build, unit, context budget; every Chromium journey but `party-known`
(which floods the local ports; CI runs it); the iPad project and WebKit on CI.
