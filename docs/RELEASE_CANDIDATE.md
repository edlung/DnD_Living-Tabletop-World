# Ravenford Alpha v0.1 — release candidate

**Status: prepared, not released.** Everything a release needs is in place and verified on this
machine; the tag waits for the owner's human playtests (Stage 360,
`reviews/OWNER_DECISIONS_9_2026-10-15.json`). No server has been deployed, nothing announced.

## What it is

A closed alpha of the Living Tabletop World: the Russian Ravenford campaign «Пропавший караван»
on the World Engine and PostgreSQL, played in a browser by a DM and a player, deployed with
Docker Compose behind Caddy (HTTPS), signed in with single-use invitation links. NPC speech, DM
intents and Chronicle prose can run on Claude Sonnet 5.5 within stored spending ceilings, with a
deterministic local fallback; pictures come from a curated GPT-made set, and in play from an
OpenAI model through OpenRouter within a $5 ceiling (placeholders when none is stored).

## Identification

- Candidate revision: `main` at `145af62` (Gate 06 remediation merged) plus the Stage 360 changes
  recorded in `reports/STAGE_360_PLAYTESTS.md`; the final revision is the one the release
  records.
- Images: `deploy/scripts/build.sh <revision>` builds `ltw-server:<tag>` and `ltw-proxy:<tag>`
  from `git archive` of that revision (tag = its 12-character commit ID); the same revision
  always builds the same files.
- Earlier tag `v0.1.0-rc.1` marks the Stage 250 vertical slice (`7d7e8b3`); it is history.

## Install

- On a VPS: `deploy/RUNBOOK.md` section 1 (first install), section 2 (deploy a tag), section 7a
  (enable live AI), section 8 (images in play), section 12 (reset a review campaign database).
- On this machine (local CA, `https://localhost`): `deploy/RUNBOOK.md` section 11;
  `deploy/verify/ci.sh` does the whole check on a clean checkout, as CI does.
- Development (no Docker stack): `pnpm install --frozen-lockfile`, `pnpm db:up`, `pnpm build`,
  `pnpm db:migrate`, `pnpm seed:ravenford`, `pnpm dev:server`, `pnpm dev:web`; `pnpm validate`
  runs format, lint, typecheck, context budget, unit, build, migrate, seed, integration and E2E.

## Scope

Player: the Russian Ravenford — find Mira and the caravan through the world, investigate objects,
hypotheses and contradictions, talk with NPCs (live model or templates), Orin's recall, combat on
a battle map with reactions, Day 2, the Chronicle with flashbacks, pictures of places and people.
DM: invite players, add NPCs in words with a preview of who learns what, perform an NPC, act for
an absent player, run encounters, move time and weather, write Chronicle chapters, request,
approve and replace pictures, undo safely; a live session (both screens follow the world).

## Verification on the candidate

| What                                             | Result                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate` on `d41a3d7` (code of `145af62`) | unit 2904, integration 230, E2E 119 — pass                                                                                          |
| `deploy/verify/ci.sh` on `d41a3d7`               | deployment check passed (TLS, headers, trust boundary, sign-in, images, browser journeys in Russian, backup, restore drill, alarms) |
| Hosted CI on pull request 9                      | Validate and Deployment check — pass                                                                                                |
| Gate 06 full-stack red team                      | PASS after remediation and retest (`reviews/ASTRA_GATE_06_REPORT.md`)                                                               |
| AI stand-in pass on the deployed build           | done, a filter only (`reports/STAGE_360_PLAYTESTS.md`)                                                                              |
| Human playtests                                  | **pending — the owner's**                                                                                                           |

## Known limitations

- Usability is not yet shown by people: the AI stand-in pass found friction (see its report);
  the human sessions decide.
- One player character in the campaign (Elowen): a session is a DM and one player.
- Live AI needs the owner's key and stored ceilings; without them NPCs answer from templates.
- Docker Desktop delivers every client from one address, so per-address limits are shared there;
  on a Linux server clients keep their own addresses (RUNBOOK section 1).
- A database seeded before Gate 06 must be reset to take the opaque IDs (RUNBOOK section 12).
- Off-host backup copies are prepared but not configured (RUNBOOK section 10, owner's choice).

## Recovery

`deploy/RUNBOOK.md`: roll back (section 3), restore from a backup (section 5), revoke a user
(section 6), stop all AI spending (section 7), stop image spending (section 8), logs and alarms
(section 9). The event store is canonical; migrations are additive; a restore drill replays every
campaign to the same digest.

## Review mapping

| Boundary                                                   | Review                                      |
| ---------------------------------------------------------- | ------------------------------------------- |
| Knowledge, memory, context                                 | Gates 01–02                                 |
| Reactions                                                  | Gate 03                                     |
| NPC isolation, AI authoring                                | Gate 04                                     |
| Integrated backend                                         | Gate 05                                     |
| Client, live session, live AI, images, sign-in, deployment | Gate 06 (`reviews/ASTRA_GATE_06_REPORT.md`) |
| Architecture decisions                                     | ADRs 0001–0037 (`docs/adr/README.md`)       |

## To release (after the owner's playtests)

1. The owner's disposition of every playtest finding; bounded fixes with regression tests and
   another session after a blocking fix (`work-orders/OPUS_STAGE_360.md`).
2. Full validation on the final revision (`pnpm validate`, `deploy/verify/ci.sh`, hosted CI).
3. The release identifier and tag (`v0.1.0`), the destination, and the record in
   `reports/STAGE_250_RELEASE.md`.
