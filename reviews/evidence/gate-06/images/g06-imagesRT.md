# Gate 06 red team — images

**Team:** images (Stage 330; ADR 0022, 0023, 0035). **Revision:** 0cc8d8d (images ltw-server/ltw-proxy:0cc8d8db2411, reused, not rebuilt). **Stack:** `ltw-g06-images`, HTTPS 127.0.0.1:18446, HTTP 127.0.0.1:18083, backend prefix 10.241.4 (I read the brief's mangled `LTW_BACKEND_10.241.4` as `LTW_BACKEND_PREFIX`), TLS internal, placeholder generator. **What ran:** `deploy.sh`, then `review-campaign.sh` twice (51 curated pictures; the rerun imported 0 and found 51 already present). After that: DM and player sessions through Caddy with cookie jars, the live stream, the operator CLI, a server recreate (OpenRouter generator, fake key, egress network cut), a ledger harness on a throwaway Postgres I created and removed. At the end: `docker compose down -v`, `deploy/.env` deleted. Evidence: `g06-evidence/images/` (t1–t11, scripts/). Tokens were never printed. The jars are deleted.

## Findings

**G06-images-01 — Medium — Approved state pictures reach players whatever the entity's state or observation.**
`GET …/entities/:id/assets` and `…/assets/content/:hash` return every approved derived image of a known entity. This includes status and condition variants (`dead`, `unconscious`, …) that presentation would choose only when the entity is observed in that state.
Repro:
1. As DM: `RequestAsset {entityId: captain-thorne, variant: derived, label: dead, audience: players}`, then `ApproveAsset`.
2. As Elowen's player (Thorne is known, not observed, tags `["day"]`): the assets list gains `["derived","image",1,"9c4e63…"]` and the bytes return 200.
3. Presentation still shows the reference.
4. No live signal fires, so this is a pull disclosure.

Evidence: `t2-audience-variants-live.txt`, `t2-thorne-dead-as-player.svg`.
Violated: ADR 0023 §3–§4 (status and conditions only for observed entities; a variant applies only when its condition holds). Also the DM's approval copy, "Shown to players who can see {name} {when}" (`apps/web/src/i18n/ru-images.ts:66`). With a real generator the picture is the spoiler, for example "Thorne dead" before anyone saw it.
Fix: the player asset list and the content check should expose only what presentation could choose for that perspective. That is the reference, figure and battle map, plus derived image variants whose label parts are all among the tags visible to it (at least never status or condition labels of unobserved entities). Alternatively, drop derived images from `entityAssetsFor` and gate content by "presentable now or at `at`".

**G06-images-02 — Low — The placeholder picture encodes the DM-only label.**
`placeholderSvg` frames a derived variant in `hsl(FNV(label) % 360 …)`. A player who may fetch the bytes reads the hue and brute-forces a small vocabulary. Hue 9 → `dead`, a unique match.
Repro: G06-images-01 steps 1–2, then `python3 -I label-oracle.py t2-thorne-dead-as-player.svg`.
Evidence: `t2-label-oracle.txt`, `label-oracle.py`.
Violated: ADR 0022 §5 ("a player never sees … labels"). In play, the placeholder is the production default.
Fix: derive the frame hue from the seed (request ID) or an HMAC, never from the label alone.

**G06-images-03 — Low — The player-visible `version` reveals the DM's hidden picture history.**
`version` counts every earlier asset of the kind: DM-only, candidates, retracted, discarded.
Repro, on market-square:
1. A DM-only `night` is approved. It also supersedes the players' night, which disappears from their list.
2. A new players' `night` is approved.
3. The player now sees `["derived","image",3,…]` after having seen only v1, so a hidden v2 exists.

Evidence: `t9-supersede-undo.txt`, `t2-audience-variants-live.txt` (section C).
Violated: ADR 0022 §5 ("never … DM-only assets, candidates, … lineage").
Fix: in `playerAssetView`, report an ordinal among the pictures this perspective has been shown (or none).

**G06-images-04 — Low (defence in depth; design-accepted by ADR 0035 §6) — The canonical description, DM-only everywhere else, is the image prompt.**
`briefFor` passes `entity.description` to the generator. The knowledge projection never shows that field to players. For Ravenford's cult faction it reads "Тайный культ, устроивший нападение на караван…". With OpenRouter, the painted result reaches players after one visual approval.
Evidence: `t8-brief-tasktext.txt`, rendered with the shipped `taskText`.
The UI says the note goes "вместе с тем, что о нём записано в мире", but the DM never sees the exact description sent.
Fix: show the exact description in the request card, or add an appearance-only field.

## Checked and sound

- **Before approval, on every route.** A candidate (players audience) was a 404 for the assets list, presentation, content, the PARTY perspective and the scene. The live streams (plain, focus, place) signalled nothing for request, candidate, or a DM-only approval of a hidden entity (t1, t2).
- **404 equivalence.** Unapproved, hidden-entity and nonexistent hashes give the same 404: identical header digest and body (t5).
- **Perspective escalation.**
  - The player asking for `DM` or another character gets 403, and a malformed or duplicated `perspective` gets 400.
  - Another campaign's ID, or a hash in a campaign the player does not belong to, gets 404; the lineage is 403 for the player.
  - Outsider: 401. Revoked player: 401 on every image route, and the stream closes as `unauthenticated` (t11).
  - DM preview as Elowen follows player rules (t11).
- **Supersession (v3), undo and replay.**
  - Approval supersedes its kind, and undo restores it.
  - Undo beneath a later approval or request is UNDO_UNSAFE and names the blocker.
  - A retracted, superseded or discarded picture cannot be approved.
  - `at` never revives a superseded or retracted hash.
  - Lineage and every player view were identical after a server restart (t1, t9, t10, t4).
- **Authority.** The DM cannot forge `Start/Complete/FailAssetJob` (403). The player cannot request, approve or cancel (403). Purpose/kind mismatches and missing references are refused (t4).
- **Curated import.** The rerun is idempotent and leaves the DM's undone approval and retraction as they were (t3). The server's worker skips `ravenford.curated.*` requests, and HTTP command IDs are actor-prefixed, so the DM cannot name them.
- **Content.**
  - `image/webp` and `image/svg+xml` responses carry `nosniff`, `no-store`, `Vary: Cookie`, CSP `default-src 'none'; style-src 'unsafe-inline'; sandbox` and XFO DENY. No Range or ETag.
  - The page CSP allows `img-src 'self' blob: data:`.
  - The cookie is `SameSite=Strict; HttpOnly; Secure; Path=/api`, so cross-site `<img>` loads carry no session.
  - The 2 MiB store limit, the 1.5 MB re-encode and `limitInputPixels` were checked by reading the code.
- **Ledger.**
  - No ceiling: jobs fail as `UNAVAILABLE`, the log says `denied: no-budget`, and 0 charges are recorded.
  - A 1-µ$ ceiling: `denied: ceiling`, 0 charges. Concurrent RequestAsset were mostly `RATE_LIMITED` per actor (t6).
  - The CLI refuses missing authorization and negative, fractional or huge amounts.
  - Harness: 40 concurrent reservations of $0.50 from 4 pools against a $1 ceiling admitted exactly 2. A second settle changes nothing, and an over-cost settle blocks further reservations (t7-ledger-race.txt).
  - Orphan CLI: a young reservation is refused (`RESERVATION_TOO_RECENT`), it settles once, a bogus or injected ID is refused, and the history tables reject UPDATE (t7-orphan-settle.txt).
- **Logs.** The fake key and the DM note never appeared in the server or proxy logs.

## Coverage

- **Routes:** lineage, entity assets, presentation (image, figure, battleMap), scene, content with and without `at`, the live stream (3 subscription shapes), all asset commands plus Undo.
- **Personas:** DM, player, outsider, revoked player, DM preview.
- **Spending:** the operator CLI (budget-set, spend, status, reservations, settle) and the image generator switch.

## Limits

- No real provider and no paid call. I did not test the egress-reachable race at a ceiling of $0.50 or more on the deployment (the brief allows only a tiny ceiling). I ran the race on a throwaway database with the shipped ledger code.
- DISCARDED in vivo: the placeholder completes within milliseconds of `StartAssetJob`, so a cancel-while-running window was not reproduced. I verified it by code (decide.ts:145/184/208).
- Cross-campaign content: only one campaign can exist per database (the English seed is refused). Isolation was verified via non-membership and the campaign-keyed store, not with two campaigns sharing a hash.
- No browser (Playwright) pass. The client's rendering of state pictures was not exercised.
- Out of area: none tripped.
