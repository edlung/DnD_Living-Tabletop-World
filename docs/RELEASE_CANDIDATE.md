# Ravenford Vertical Slice v0.1 — release candidate

**Status: release candidate prepared. Not released.** Product and usability acceptance are
incomplete (see `reports/STAGE_240_USABILITY.md`) and no publication target is authorized
(`reports/STAGE_250_RELEASE.md`).

## What it is

A local, single-machine vertical slice: the Ravenford world on the World Engine and
PostgreSQL, a Player/DM web client, and deterministic offline AI behaviour. It is **not** a
production deployment: authentication uses development persona tokens (ADR 0009), the web
bundle is a build artifact with no hosting, and no live AI provider has been exercised.

## Identification

- Code revision under validation: `47f4da4` (validated in a fresh clone). Later commits on
  the branch change documentation and reports only; the tag/identifier is to be assigned by
  the owner when a target is authorized.
- Web bundle from that clone: `assets/index-C2LN-Xy5.js` SHA-256
  `e5d19cde2735524e7e72a29c9118a9bd6ec4e1faee93c22cae032f586652441b`;
  `assets/index-CDTB2acu.css` SHA-256
  `df6b3ffa479865237cbbee4fdabfb657c7d2f967ebe539b8ad77db03c6fd56f6`.

## Install, start, validate (reproducible)

Prerequisites: Node 24+, pnpm 11, Docker, Playwright Chromium
(`pnpm exec playwright install chromium`).

```bash
pnpm install --frozen-lockfile
pnpm db:up
pnpm build
pnpm db:migrate         # applies 0001–0004
pnpm seed:ravenford     # 91 submissions, idempotent
pnpm dev:server         # http://127.0.0.1:3000
pnpm dev:web            # http://127.0.0.1:5173 (proxies /api)
pnpm validate           # format, lint, typecheck, context-budget, unit, build, migrate, seed, integration, E2E
```

Sign in with campaign `ravenford` and a token from `fixtures/ravenford/personas.json`
(`dev-player-elowen`, `dev-dm-ravenford`). `pnpm validate:ci-local` reproduces CI from a
frozen install.

## Configuration and fixtures

`.env.example` lists every variable; all are optional in development. `DATABASE_URL`
defaults to the docker-compose PostgreSQL (port 54329). Without `ANTHROPIC_API_KEY` only the
deterministic local provider runs; images are placeholders. Fixtures live in
`fixtures/ravenford/`; the browser tests build their own in-memory worlds and need no
database or provider.

## Scope

Player: find Mira and the caravan through the world, investigate objects, contradictions,
Orin, memory recall; battlefield combat with Fireball preview and Counterspell/Ignore;
return to a changed Day 2; Chronicle with flashbacks. DM: add an NPC in natural language
with preview/edit/confirm/cancel and safe undo; Player View; perform an NPC; run encounters;
move time and weather; write Chronicle chapters.

## Known limitations

- **Usability acceptance incomplete:** no human uncoached session; an AI-stand-in pass found
  ten friction points awaiting owner disposition (`reports/STAGE_240_USABILITY.md`).
- Development personas only; production authentication is undecided (prerequisites Q4).
- No live AI runs; the offline interpreter understands few phrasings; scripted d20 in tests.
- No live event subscription (explicit refresh); creature turns are DM-run; no opportunity
  attacks or timed reaction expiry; single-process asset worker; placeholder images.
- Authoring: NPC proposals only are editable in the form; an unfinished draft and the undo
  control are lost on perspective change or reload.
- Carried backend limits from the stage reports: no seasons; lexical Chronicle hedging;
  heuristic memory suggestions; full replay per view.
- Hosted CI has not been executed remotely; the web bundle has no production hosting.

## Recovery

- Reset the local database: `pnpm db:down`, remove the compose volume, `pnpm db:up`,
  `pnpm db:migrate`, `pnpm seed:ravenford`. Migrations are append-only; seeds are idempotent.
- A DM mistake: authoring commits undo as a unit when safe (named blockers otherwise);
  `UndoCommand` reverses a player command. Canonical history is never edited in place.
- A stuck encounter: the DM runs the suggested turn, closes the reaction window, or ends the
  encounter. Stale browser state: **Refresh world** or **Leave session**.

## Evidence and review mapping

| Boundary                     | Independent review                               | Release-candidate relation                                                                         |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Knowledge / memory / context | Gate 01 PASS; Gate 02 Retest 2 PASS (`reviews/`) | Reviewed code unchanged; new reads are additive with boundary tests                                |
| Reactions                    | Gate 03 Retest 4 PASS                            | Unchanged; UI consumes the existing window lifecycle (E2E stale/duplicate)                         |
| AI authoring / NPC           | Gate 04 Retest 1 PASS                            | Unchanged; UI uses the same routes (E2E preview, stale, undo)                                      |
| Full Ravenford red team      | Gate 05 Retest 2 PASS at reviewed `a85b6f8`      | Backend diff since is additive (session, sheet, surroundings reads); client not certified by Astra |
| Deterministic validation     | `pnpm validate`                                  | Exit 0 in a fresh clone; see the Stage 250 report                                                  |
| Usability                    | none yet                                         | Open: `reports/STAGE_240_USABILITY.md`                                                             |
| Architecture decisions       | ADRs 0001–0030 (`docs/adr/README.md`)            | Stages 200–240: ADRs 0026–0030                                                                     |
