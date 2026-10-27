# Gate 06 — Full-Stack Red Team (Stage 355): PASS after remediation and retest

## Review header

- **Review ID:** GATE-06 (initial pass, remediation, retest 1)
- **Stage/Gate:** the deployed alpha build, Stages 0–350 / Gate 06 (review activity Stage 355)
- **Attacked revision:** `0cc8d8d` (main after Stage 350), images `ltw-server`/`ltw-proxy:0cc8d8db2411`.
- **Remediated revision:** `d41a3d7` on branch `gate-06-fixes` (pull request 9); the retest ran on
  `127afb4` (images `:127afb418022`), the retest's own four findings were then fixed in `d41a3d7`.
- **Date:** 2026-10-27
- **Reviewers:** six independent agent contexts of Claude Opus 5.5 (owner decision 2026-10-11:
  reviews by Opus 5.5 in fresh contexts; `ASTRA_GATE_PROMPTS.md`). Five attack teams, one per area,
  each on its own deployment built from the same images, and one retest context. None of them
  wrote the code under review or saw the others' findings before reporting.
- **Request:** [handoff](../handoffs/ASTRA_GATE_06_REQUEST.md).
- **Method:** the deployed build without source modification: white-box reading, black-box attack
  through Caddy (HTTPS with the local CA), the live stream, a real Chromium, the operator CLI where
  the runbook gives the operator that power, and the database only as a backup/restore operator.
  Two passes per team: invariant-directed (`ARCHITECTURE_INVARIANTS.md`, `ADVERSARIAL_TESTS.md`,
  the ADRs of the area, `docs/GATE_COVERAGE.md`) and emergent.
- **Paid calls:** live Sonnet 5.5 for the AI team only, through stored operator records (ceilings
  $10 stage, $15 day, $10 session; owner decision `reviews/OWNER_DECISIONS_9_2026-10-15.json`):
  about 35 calls, **$0.088** spent, 0 open holds. No paid image call.
- **Overall result:** **PASS** after remediation and retest. One open item awaits the owner
  (G06-client-02, below); it is not a violation of a stated rule.

## Teams and stacks

| Team   | Area                                                                                 | Stack (HTTPS) | Evidence                           |
| ------ | ------------------------------------------------------------------------------------ | ------------- | ---------------------------------- |
| auth   | Stage 340 sign-in, sessions, limits                                                  | 18443         | [auth](evidence/gate-06/auth/)     |
| client | perspective isolation in the browser and over the change signal (Stages 200–330)     | 18444         | [client](evidence/gate-06/client/) |
| ai     | prompt injection against live Sonnet 5.5, RU and EN                                  | 18445         | [ai](evidence/gate-06/ai/)         |
| images | Stage 330 visibility, approval, ledger                                               | 18446         | [images](evidence/gate-06/images/) |
| infra  | Stage 350 deployment, backups, restore, hardening                                    | 18447         | [infra](evidence/gate-06/infra/)   |
| retest | every finding, the upgrade path, runbook §12, regressions, coverage rows 290 and 310 | 18448         | [retest](evidence/gate-06/retest/) |

Evidence keeps no token, cookie, password or key; dumps, CA certificates and DM links were left
out of the repository.

## Findings and their disposition

| ID            | Severity        | Finding (one line)                                                                                                                                                                                        | Fix                                                                                                                                                                                    | Retest                        |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| G06-client-01 | **High**        | Semantic IDs of entities a player perceives unnamed (`goblin-shaman`, the caravan site and its objects) reached the player's network bodies; AI authoring stored model-chosen readable IDs (`tomas-reed`) | Opaque seeded IDs (`creature-ae08be99`, …); AI proposals get trace-scoped server IDs for new entities and knowledge records; guard test over every seeded campaign; ADR 0008 amendment | FIXED                         |
| G06-images-01 | Medium          | Approved state variants (`dead`) of a known but unobserved entity were listed and served to players                                                                                                       | Players get only what presentation could choose for their perspective and time; memoized per history version; ADR 0022/0023 amendments                                                 | FIXED                         |
| G06-images-02 | Low             | The placeholder's frame hue encoded the DM-only label                                                                                                                                                     | Hue from the request, never the label                                                                                                                                                  | FIXED                         |
| G06-images-03 | Low             | The player-visible asset `version` revealed hidden DM pictures                                                                                                                                            | No `version` for players                                                                                                                                                               | FIXED                         |
| G06-images-04 | Low             | The DM-only description feeds the image prompt (accepted by ADR 0035 §6)                                                                                                                                  | The DM's request form quotes it with a warning                                                                                                                                         | FIXED                         |
| G06-infra-01  | Low             | PostgreSQL ran with the default capabilities                                                                                                                                                              | Only CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID                                                                                                                                       | FIXED                         |
| G06-infra-02  | Low             | No process limits                                                                                                                                                                                         | `pids_limit` on every service                                                                                                                                                          | FIXED                         |
| G06-infra-03  | Low             | The drill database had no memory limit and an unbounded RAM tmpfs                                                                                                                                         | `DRILL_MEMORY`, `DRILL_DATA_SIZE`                                                                                                                                                      | FIXED                         |
| G06-infra-04  | Low             | An impossible dump time sorted first and became `latest`                                                                                                                                                  | Ignored; `latest` from the manifest                                                                                                                                                    | FIXED (strengthened by RT-02) |
| G06-auth-01   | Low             | The global refused-redeem budget can block real sign-ins under a distributed flood                                                                                                                        | None: ADR 0036 scopes distributed attacks out; one client cannot sustain it (per-client limit and lockout, forged `X-Forwarded-For` ignored)                                           | Accepted by design            |
| G06-client-02 | Low (uncertain) | Before identification, the shaman's visible equipment (`dagger`) and picture differ from the raiders'                                                                                                     | None: ADR 0023 §3 shows observed equipment, ADR 0027 §3 withholds only the name; the DM can keep a picture DM-only                                                                     | **Owner's call**              |
| —             | Low (UX)        | Found while fixing: the action result lay over the scene's objects and swallowed their clicks                                                                                                             | The result has one place, clear of the row; a journey checks every object stays reachable; STAGE_320_DESIGN §5.2 amendment                                                             | FIXED                         |
| G06-RT-01     | Medium (ops)    | RUNBOOK §12's way back used a regular dump that retention removes after a day                                                                                                                             | Step 1 takes a protected `prerestore` dump                                                                                                                                             | Fixed in `d41a3d7`            |
| G06-RT-02     | Low             | A file dropped into the backup directory joined the manifest at the next prune                                                                                                                            | The manifest lists only dumps backup.sh wrote; future times ignored                                                                                                                    | Fixed in `d41a3d7`            |
| G06-RT-03     | Low (UX)        | On a tablet with the details drawer open the result covered a visible object                                                                                                                              | The result sits at the drawer's foot                                                                                                                                                   | Fixed in `d41a3d7`            |
| G06-RT-04     | Low (copy)      | Things were labelled «жив» (alive); the unidentified place had two names                                                                                                                                  | «на месте» for things; one name everywhere                                                                                                                                             | Fixed in `d41a3d7`            |

Every code fix has a regression test that fails on the code before it (recorded in the commits;
the RUNBOOK §12 change of RT-01 is documentation and was not walked again on a deployment);
independent read-only reviews of the image and opaque-ID fixes found follow-ups (a per-request
history replay, a live fetch race, an exported unsafe helper, model-chosen knowledge IDs, repeat
proposals, a stale-seed message, a vacuous guard) and all were fixed before the retest.

## Checked and sound (all reproduced on the deployments)

- **Sign-in (Stage 340, ADR 0036):** forged, used, replayed, revoked and cross-campaign links fail
  with one fixed 401; ten racing redeems of one link give exactly one session; the 409 replace
  flow spends nothing; CSRF/Origin on every non-GET route, `/auth/session` and the live stream;
  cookie `Path=/api; HttpOnly; SameSite=Strict; Secure`; revocation closes the live stream within
  a cycle; development persona tokens fail in production; no token in logs, URLs or Referer;
  `/join` cannot be framed.
- **Client isolation (Stages 200–330):** the change signal stays silent for secret-only commits
  (ADR 0033); DM-authored names are escaped (no XSS), descriptions never reach players; uniform 404
  for hidden and nonexistent entities; perspective escalation refused; no client storage of
  credentials; the CSP holds with no violation in the browser.
- **Live AI (Stage 300, ADR 0032):** eight jailbreak classes in Russian, English and mixed against
  Orin (who holds a SECRET) and Mira; the forbidden records are never in the provider input
  (`sourceIds`); prose never mutates canon; AI DM-intents that would kill Orin, add items or
  declare world truth are refused at commit with no event; Chronicle chapters hedge hypotheses;
  holds reserve the worst case and settle; the per-actor rate limit holds a burst.
- **Images (Stage 330):** nothing reaches a player before approval on any route, the live signal
  included; approval supersedes its kind with undo and replay; ledger races at the ceiling admit
  exactly what fits; the curated import is idempotent; content headers (`nosniff`, `no-store`,
  sandbox CSP).
- **Deployment (Stage 350, ADR 0037):** the server is reachable only through Caddy; forged
  `X-Forwarded-For` changes no limit; backups reject flipped, truncated, empty and unlisted dumps;
  the restore drill replays to the same digest; no secret in images, logs, dumps or argv; HSTS
  only with ACME; operator surfaces only through `docker compose exec`.
- **Coverage rows checked by the retest:** Stage 290 — Russian Chronicle hedging («Со слов
  рассказчика…», «Подозрение, не установлено…») and Russian memory recall stay inside the
  perspective; histories written by the earlier revision load and replay on the new image (restore
  of the pre-reset dump). Stage 310 — the DM's action for an absent player is DM-only, recorded
  with its reason, undoable by the DM; the player cannot act for another character or undo it.
- **Upgrade path:** a forward deploy onto a database seeded by `0cc8d8d` refuses the old seed with
  a clear message; RUNBOOK §12 walked as written resets it; `restore.sh` returns to the old world.

## Coverage (`docs/GATE_COVERAGE.md`, alpha rows)

| Row                                       | Covered by                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| 200–240 client consumers                  | client team; retest regressions                                                |
| 290 play language                         | ai team (RU/EN/mixed, declension); retest (hedging, recall, earlier histories) |
| 300 live providers                        | ai team (live Sonnet; provider input, fallback, holds, keys not logged)        |
| 310 change signal, DM acting for a player | client team (signal); retest (DM action)                                       |
| 330 real images                           | images team; retest                                                            |
| 340 production sign-in                    | auth team; retest regressions                                                  |
| 350 deployed build, proxy, trust boundary | infra team; retest; `deploy/verify/ci.sh`                                      |

## Limits

- Docker Desktop delivers every client from one address: per-address limits were tested with
  forged headers, not with distinct real addresses; IPv6 grouping was not exercised.
- No real image provider was called (ledger races ran against the shipped code on a throwaway
  database); the AI team's spend stayed far below the ceilings, so a ceiling stop was shown by the
  rate limiter and the ledger tests, not by exhausting $10.
- One revision only: rollback across an additive migration (`LTW_ALLOW_NEWER_SCHEMA`) was not
  driven on a deployment; it is covered by integration tests.
- The retest ran on `127afb4`; the four retest findings were fixed in `d41a3d7` and verified by
  `pnpm validate` and `deploy/verify/ci.sh` there, not by another independent retest.
