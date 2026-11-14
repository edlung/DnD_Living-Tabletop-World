# Second family campaign delivery handoff

- Gate: owner-requested complete second campaign; no new numbered stage.
- Type: INITIAL.
- Completed work: «Экспресс “Тысяча Желудей”», 12 evenings and complete local art/book/native package.
- Revision: base `e69c3290ca34cbde4a837591bfb477b899581142` plus the goal-specific file manifest.
- Prior report: N/A; the separate Lighthouse report remains preserved.
- Report: `reports/ACORN_EXPRESS_2026-11-08.md`.
- Session model: the selected Codex session authored and verified; no separate reviewer.
- Authority: owner's active goal «Сделай еще одну захватывающую кампанию полтностью»;
  `work-orders/ACORN_EXPRESS_2026-11-08.md`.
- Identity: `reports/evidence/acorn-express-2026-11-08/file-identity.json` (captured after checks).
- Status: TECHNICALLY_VERIFIED; delivered for owner play disposition, which is not claimed.

## Objective

Deliver a complete, original, illustrated family adventure using the project's existing authority,
knowledge and campaign import paths, with consequential endings and usable materials from the
opening to personal epilogues. Preserve the first campaign and unrelated user changes.

## Authoritative documents

`AGENTS.md`, `AGENT_WORKFLOW.md`, `docs/PROJECT_WORKFLOW.md`, `ARCHITECTURE_INVARIANTS.md`,
the authorized work order, `campaigns/acorn-express/README.md` and the authored source.

## Reproduce

```sh
pnpm acorn:build
pnpm acorn:book
pnpm acorn:check
pnpm typecheck
pnpm test:e2e tests/e2e/acorn-package-import.spec.ts
```

For the book, open `campaigns/acorn-express/index.html`; players use `players.html`. Start a new
empty workshop draft and select its `package.json` to review a native import. Actual activation
remains a separate confirmation. Art transfer instructions and the read-only default are in README.

## Surfaces and scopes

- Real package allocator/compiler, frozen activation in memory and campaign encounter book.
- PLAYER, DM and outsider HTTP projections; all essential inspect clues, private NPC metadata and
  content bytes, exact-package art import and duplicate command handling.
- Empty `acorn-import` E2E owner fixture; invalid JSON, preview without mutation, uncertain save,
  identical retry, one OWNER revision and READY after reload.
- Forty-one local book pages, player-facing cards, original and runtime images, matching map cells.
- Evidence contains only local measurements, selected screenshots, command results and file hashes;
  no authentication material or environment contents.

## Validation and adversarial coverage

The completion report is the validation ledger and records initial diagnostics, final results and
editorial counterexamples. All package variants, three-seat assignments, clue access, optional
encounters and art boundaries have automated coverage. Family enjoyment, real-session pacing,
actual campaign activation and deployment are not represented as tested or accepted.

## Owner use

The intended next action is to open the first evening and choose three heroes. Runtime activation,
publication and credential changes were not performed. Human play feedback may guide future edits;
this delivery does not require a further implementation stage to play the authored campaign.

Disposition: technical PASS; complete authored campaign delivered. Owner play acceptance and any real activation remain separate.
