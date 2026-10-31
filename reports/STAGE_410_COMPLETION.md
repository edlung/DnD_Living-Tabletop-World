# Stage410 — Scenario and generation browser

Date:2026-10-30. Status:**TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**.
Base:`e176349`; branch:`codex/stage-410-scenario-preview`.
Authority:`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`.
Scope:`work-orders/STAGE_410.md`; design:`docs/STAGE_410_DESIGN.md`.

## Result

The private workshop now opens a draft editor with revision history, a linked
scenario browser and generation controls. The scenario exposes opening, cast,
places, motivations, conflicts, typed knowledge and holders, willingness, clue
access, relationships, prepared situations/encounters, quests, visual briefs and
later plans through structured fields and connected objects. Owner corrections
append immutable revisions. Incomplete saved steps and late generation proposals
are explicitly labelled and read-only.

The generation form shows actual availability, durable step progress, cancellation,
failed-job retry, history and explicit access to saved outputs. Retrying selects
the child job and reuses completed steps. Unavailable and uncertain outcomes do
not become successful campaigns. Progress uses a dedicated lightweight database
projection; it does not retrieve full prompt/output/scenario bodies.

The common owner/session boundary aborts requests and rejects late results on
revocation, replacement and navigation. Page-history snapshots synchronously clear
the private subtree. Same-owner CAS conflicts preserve the form and its nonce;
lost acknowledgements can replay the original payload. Full scenario data loads
only in the scenario tab. Russian/English labels, keyboard tabs and editor focus
are implemented; generation polling does not steal focus or overwrite input.

## Changed files and verification

Main boundaries: server `workshop/generation/postgres-progress.ts`, repository and
HTTP progress ports; campaign contract feature exports; web `workshop/` editor,
session/client, generation and scenario modules; three scoped stylesheets and two
Russian dictionaries; isolated UI fixtures and browser tests. The checkpoint
manifest lists the exact files.

Full isolated `pnpm validate`: **PASS, exit0;3,132unit/326files,
286integration/48files,156Chromium journeys**. Format, lint, types, context budget
(1,235active files; zero over target), build, migrations and seed passed. The
throwaway database was dropped. The initial run passed3,132unit/326files and
286integration/48files, then found10browser failures: nine existing workshop tests
exposed a changed draft-heading accessible name and one keyboard test exposed an
arrow-navigation assumption. Heading semantics and focus-based tab navigation
were fixed. All24old/new workshop browser regressions subsequently passed; no
existing test was weakened. Both logs are preserved.

Layout evidence covers six states at1440/768/390/320 in the sole dark theme:
opening, linked inspector, correction, generation form, completed job and saved
preparation step. All24measurements have zero errors/warnings, with reviewed
inherited spacing information only. Screenshots include full-page and focused
viewport views. Accessibility scans cover the same24combinations. Findings fixed
include selected-job text contrast and cramped/mobile inspector positioning.

## Own adversarial pass and limits

Checks cover foreign owner and campaign credentials, expected-owner mismatch,
revocation with delayed responses, cookie replacement, synchronous history clearing,
CAS conflicts/lost acknowledgements, cancellation, late proposals, partial-output
inspection, failed retry reuse, missing provider, oversized valid brief and poisoned
stored full artifacts excluded from progress. Duplicate local keys remain separately
inspectable, and shared-subject graph edges are labelled without asserting proof.

No live campaign event, default database migration, credential/operator grant,
production dependency, deployment or paid provider call occurred. Browser generation
uses an explicitly scripted test-only provider. Live AI quality/cost/latency remains
NOT_RUN and due450. Visual projection/images remain420; selective editing/locks430;
activation440. The existing Vite large-chunk warning remains. No human acceptance
is claimed. Continue to420 under the owner's delegated technical-checkpoint direction.
