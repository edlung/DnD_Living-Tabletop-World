# Stage440 — Confirmed campaign activation

Date:2026-10-30. Status:**TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**.
Base:`689967c`; branch:`codex/stage-440-campaign-activation`.
Authority:`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`.
Scope/design:`work-orders/STAGE_440.md`, `docs/STAGE_440_DESIGN.md`.

## Result

The owner reviews the latest saved scenario, picture choices and warnings, then
explicitly confirms one durable activation. Acceptance binds package, plan,
protection, visual-manifest and review digests and the exact acknowledgements.
The same nonce returns the same operation after a lost answer. The accepted USER
intent survives a closed tab or ended session; later draft changes cannot rebase
that frozen source. Every new owner request still authenticates the current session.

A dedicated bounded BootstrapCampaign command applies the complete initial world
as one atomic World Engine batch. Prepared party membership is canonical and
separate from controllers; no player, played combat, discovery, memory, Chronicle
or quest progress is fabricated. The ordinary HTTP command route and gated event
store refuse direct BootstrapCampaign submission.

Chosen current pictures are copied with exact encoded bytes, MIME, hash and honest
draft/provider origin, without regeneration or fabricated paid jobs. Explicit
text-only activation copies no pictures, even if the draft has choices. Stale
selected art blocks picture activation. Unselected art uses an acknowledged
neutral fallback. Activation needs no provider route or new AI preparation grant.

Provisioning closes ordinary reads, writes, invitations, assets, presence, live
streams and fingerprints. A fenced worker resumes the same stable command after
crash and publishes only after command, content, provenance, byte and MIME proofs.
Publication is one-way. Immutable per-campaign quest/scenario content travels with
the initial world; a missing or corrupt new quest book fails closed. Legacy
untracked Ravenford streams preserve their behavior.

The workshop lists explicitly owned published campaigns. Enter campaign creates a
fresh normal one-use DM invitation and uses the existing deliberate join flow.
Confirmation itself never changes the game cookie. Mounted campaign/actor guards
and server revocation protect sign-out; late401/logout responses cannot erase a
newer credential. Pagehide synchronously removes private world DOM.

Changed entrypoints:contracts campaign/{activation,bootstrap}; domain campaign/
bootstrap and assets/adoption, prepared-party knowledge/context/quest seams; server
workshop/activation, campaigns, main composition and auth; client workshop/
activation and campaigns, imported picture lineage and session guards. Migration0022,
module guidance, context map and recovery runbook are included. The manifest lists
all delivered paths.

## Verification

Full isolated `pnpm validate`:PASS, exit0. 3,350unit tests /369files;
339PostgreSQL tests /58files;180browser tests. Format, lint, typecheck, build,
migrations and seed passed; context budget:1,461activefiles,0over target/hardlimit.
The temporary database was dropped; the default DB was unchanged.
Focused evidence also passes:
813 domain/context/historical asset tests;34 worker/review/HTTP/quest/digest unit
tests;19 storage/replay/readiness PostgreSQL tests plus one actual PostgreSQL
HTTP→worker→lost-bootstrap-ACK→fresh engine/repository→publication journey;6 memory/
publication and7 operator tests;16 game-auth tests. These overlapping focused counts
are not added together as a full-suite total.

Four-width UI audit:36 state-width combinations at1440/768/390/320,72 PNGs,
0errors,0warnings,0axe violations after repairs. Chosen/text-only reviews,
acknowledgements, provisioning, publication, owned list, actual activated world and
Russian review/publication were inspected. Root visually inspected every state
and representative screenshots at all four widths.
Focused browser verification:all10 cases pass across the first run and the
three corrected harness checks. The corrections use the actual200 save response,
character-details sheet and same-origin session probe, without weakening assertions.
Evidence:`reports/evidence/stage-440/index.md`.

## Own adversarial findings and repairs

- A prepared party initially entered current knowledge projections but its earlier
  real actions were absent from historical quest membership scans. A genuine RED
  regression led to membership beginning at PreparedPartyEstablished; initial
  placement still never counts as played travel or examination.
- The real browser pagehide event initially retained private world text in the same
  JavaScript snapshot. The identical regression became GREEN after a synchronous
  React commit. Delayed logout/401 after a newer cookie, wrong campaign, wrong actor,
  Escape and focus assertions also pass.
- An ordinary event-store wrapper initially could accept an untracked bootstrap,
  which would inherit legacy permission. It now rejects that command before append;
  only the explicitly injected raw activation engine can bootstrap.
- Review races now report stale revision before recomputing historical review
  findings; repository acceptance still repeats all transactional guards.
- The first whole unit pass exposed obsolete cookie-expiry assertions and a missing
  Russian bootstrap history label. Tests/dictionaries now match the protected
  response protocol; no cookie-expiry bypass was restored.
- UI audit exposed11.52px DM status text and an unhinted narrow prepared-party rail.
  The label is12px and the scrolling edge has a subtle fade and end padding.

## Boundaries and continuation

No default DB migration, real credential/provider/model/operator-policy change,
production dependency, deployment or external publishing occurred. All provider
transport is offline/injected; live generation quality, paid cost/latency and human
play acceptance remain NOT_RUN. Unlimited monetary policy and actual/unknown
accounting remain intact; operational safeguards remain bounded.

Recovery after0022 needs a compatible application/operator build and a consistent
backup of activation rows, scenario/quests, event streams and asset contents. Older
writers/readers cannot safely recover provisioning or interpret new bootstrap/
adoption events. See deploy/RUNBOOK.md§3/§5. No SQL publication bypass is supported.
The technical checkpoint is complete. Continue450 without another owner prompt.
The final build reports a1,252.92kB entry (336.50kB gzip); deferring private workshop
tools remains due in450, without suppressing the bundle warning.
