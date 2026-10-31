# Stage420 — Scoped world preview and draft pictures

Date:2026-10-30. Status:**TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**.
Base:`c07ab00`; branch:`codex/stage-420-visual-preview`.
Authority:`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`.
Scope/design:`work-orders/STAGE_420.md`, `docs/STAGE_420_DESIGN.md`.

## Result

Saved campaigns now have an owner world preview and a separate selected-character
preview, using the ordinary World Engine materializer and scoped scene, knowledge
and sheet projections. Navigation changes only the camera. Prepared encounter
layouts are owner-only static plans, with no initiative, round, turn or reactions.
The initial snapshot stays unchanged. Prepared-party read context supplies initial
party knowledge/identities without assigning fake controllers or authority.

Character responses, DOM and image caches exclude owner scenario/catalog,
diagnostics, alternate character choices, private descriptions, picture candidates,
lineage and future encounter metadata. Merely perceived unidentified objects have
null names. A known remote scene stays unobserved and has no hidden presence/map.
Only the selected character's full sheet is available. Owner/scenario object links
resolve authoring keys only after leaving the restricted branch.

Private image jobs use the existing configured adapter and explicit stored images
UNLIMITED policy. Appearance/style/note and exact chosen reference bytes form the
input; narrative descriptions/names/knowledge are not automatically sent. The
adapter commits a session/fence/digest-checked durable gate immediately before
transport. Uncertain dispatch cannot automatically resend; accounting settlements
survive cancellation and fencing. A stored result survives a lost acknowledgement.
Placeholder mode reports unavailable.

Generated pictures remain candidates until explicitly chosen. Figures/maps derive
from the chosen raster portrait/location. Selection has nonce/CAS semantics and
immutable manifests. Every package append atomically freezes visual version0,
covering manual and generated revisions. Compatible choices survive edits;
relevant changes mark them stale and retain bytes for comparison. Later choices
on an older revision cannot rewrite existing descendants. Historical missing
manifests initialize empty, never inherit retroactively or imply text-only consent.

## Changed files and verification

Main boundaries: contracts campaign preview/images; pure domain prepared-party
projection and memo keys; server `workshop/preview/`, `workshop/images/`, image
adapter/runtime/accounting; migrations0019/0020; shared revision append hooks;
web preview/picture controls, scoped styles/dictionary and narrow shared rendering
ports; isolated fixtures and browser journeys. The checkpoint manifest identifies
the complete changed set. No production dependency was added.

Full isolated `pnpm validate`: **PASS, exit0;3,185unit/337files,
306integration/51files,164Chromium journeys**. Format, lint, types, context budget
(1,304active files; zero over target), build, migrations and seed passed. The
throwaway database was dropped. Focused checks passed: the root's
79unit cases,45image/provider/worker unit cases,25image/runtime/accounting PG cases,
29storage/revision/generation PG regressions,43web/unit cases and8new browser
journeys. These overlapping subsets are not additional totals.

The actual PostgreSQL/HTTP integration exercises invitation redemption, a READY
non-Ravenford package save, atomic manifest0, queued image, worker and production
OpenRouter adapter with injected transport. A separate database observer proves
the dispatch marker and NULL-campaign workshop charge committed before fetch.
The candidate is initially invisible to character byte reads; explicit selection
serves the identical encoded bytes and a four-field PlayerAssetView. Nonce/worker
replay makes no further fetch. SQL canonical streams, commands and events remain0.
Reported cost in this test is a fixture, not a real provider invoice.

Responsive screenshots/audit cover nine states at1440/768/390/320 in the only dark
theme: empty owner, selected picture/candidate/stale, owner scene/details/layout,
character scene/sheet. All36measurements have zero errors/warnings; all36focused
viewport images were inspected. Full-page images are also retained. Axe also passed all36state/width combinations with zero violations. Initial findings fixed: wide character selector,
touching detail controls, raw scope identifiers, mobile scene art gap and cramped
sheet labels. Existing live board/image consumers retain their previous behavior.

## Own adversarial findings and recovery

The pass covers genuine session/lease/charge binding, route and style drift,
revocation before/at dispatch, stale workers, unknown dispatch, lost completion
ACK, cancellation, late ignored abort, corrupt/different content and parent
reference, selection races, immutable child manifests, nonce replay despite later
unavailability, foreign IDs/cursors, hidden/unselected/stale image bytes and
restricted DTO/DOM/cache/preload boundaries. Old workshop and live-game regressions
are included in the full checkpoint.

A late provider result initially could attach after worker stop; a failing test
pinned it before the abort guard was fixed. A second reproduced race allowed an
old401 response to expire a newer browser cookie. Workshop401 and sign-out
responses now avoid Set-Cookie expiration; sign-out durably revokes the presented
session and binds the mounted owner. An invalid opaque cookie has no server access
and redeem replaces it. The browser clears private state and ignores late results.
Old sign-out header assertions were updated to this safer protocol, while retaining
revoked-token and independent-game-session checks and adding delayed/stale regressions.

The first full run stopped on generated Stage410 audit JSON formatting. Its
immutable bytes were preserved; a narrow generated-layout JSON ignore was added
to Prettier, and the full run was restarted.

Browser harness repairs preserved assertions: cookie reads use the actual private
cookie path; byte identity compares the decoded displayed blob hash instead of an
aborted StrictMode request body. No product byte failure was masked.

No default DB migration, real operator/credential/model change, deployment,
publishing, canonical campaign mutation or paid provider call occurred. Recovery
after new draft/accounting subjects requires an0019/0020-aware app/operator build;
older binaries are unsupported even with allow-newer-database. A matching protected
restore requires external-cost reconciliation (`deploy/RUNBOOK.md`§3).

Live AI quality, actual paid cost/latency and human play acceptance remain NOT_RUN
and due450. Curated/scripted test rasters do not attest generated campaign art
quality. Selective edits/locks/diffs remain430; confirmed bootstrap/adoption440.
Continue to430 under the owner's delegated technical-checkpoint instruction.
Vite reports a1,125.74kB entry bundle (306.57kB gzip). The large-chunk warning
remains; workshop code-splitting is carried to the450 integration/polish pass.
