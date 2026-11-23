# Work Order — Stage 1130: the manuscript — the co-author, the plates, the binding

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1130, decisions
12 and 13); ADR 0075 §13, written with the stage. Branch `claude/stage-1130-binding`, stacked on
Stage 1120's.

## Deliver

1. Generation and activation on the manuscript's paper; the proposed pages marked until read
   (`workshop/generation/read-pages.ts`, `job.tsx`, `editor.tsx`).
2. An AI edit's review as a proofreader's marks (`comparison/review.tsx`, `changes.tsx`).
3. The draft's pictures as plates; the world preview as the proof copy.
4. Activation as binding: the bound book shown once bound (`activation/status.tsx`, `tab.tsx`);
   the published draft's DM book checked in `tests/e2e/workshop-activation.spec.ts`.
5. `styles/workshop-binding.css`; ADR 0075 §13; `reports/STAGE_1130_COMPLETION.md`.

## Boundaries

No provider, spending rule, workshop request, nonce, lock or consent changes (ADR 0032). Nothing of
a draft is kept in the browser.

## Checks

Typecheck, lint, format, build, unit, context budget; every workshop journey; generation, an AI
edit's review, the preview, activation before and after binding looked at and audited at 1440,
1024, 768 and 390 px.
