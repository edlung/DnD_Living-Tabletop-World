# Gate 06 (Stage 355) red-team — team CLIENT

**Team:** client (perspective isolation in the browser & change signal). **Revision:** 0cc8d8d (main after Stage 350), images `ltw-server/ltw-proxy:0cc8d8db2411`.
**My stack:** `ltw-g06-client`, proxy on `127.0.0.1:18444` (HTTPS) / `127.0.0.1:18081` (HTTP), backend prefix `10.241.2`, TLS internal (Caddy local CA). Deployed via `deploy/scripts/deploy.sh`, seeded the Russian Ravenford review campaign, attacked as DM (operator link) + player (Elowen, invited), then `docker compose down -v` + deleted `deploy/.env`. Shared images and neighbour stacks left intact.
**What ran:** white-box read of invariants/ADRs; black-box attacks over HTTPS through the proxy (curl, two cookie jars) and in a real browser (Playwright, Caddy CA, player session cookie).

## Findings

**G06-client-01 — High — Semantic entity IDs of unidentified combatants reach the player's browser.**
During a live encounter, the player's scoped projections expose the real IDs of creatures the player cannot name.
Repro: as DM, `PlaceEntity` goblin-raider-1/2 and goblin-shaman at `old-trade-road`, then `StartCombat` with Elowen (party) + the three goblins (hostile). As player `CHARACTER:elowen-starwhisper`:
`GET /api/campaigns/ravenford/encounter?perspective=CHARACTER:elowen-starwhisper` → combatants have `entity.name=null` (correctly unidentified) but `entity.entityId="goblin-shaman"`, `"goblin-raider-1"`, `"goblin-raider-2"`, and the same IDs in `order[]` and `currentCombatantId`. `GET …/locations/old-trade-road/scene?perspective=CHARACTER:elowen-starwhisper` repeats them. Proven to reach the browser itself: an in-page `fetch()` of the encounter from the player's own JS returns 200 with `goblin-shaman`. A player opening devtools learns a goblin **shaman** (spellcaster) stands among the "Unidentified creature N" tokens.
Evidence: `net/player-encounter-leaks-goblin-ids.json`, `net/player-scene-leaks-goblin-ids-and-equipment.json`, `browser-dom.html`, `summary-findings.txt`.
Violated: ADR 0008 §50 ("an entity whose identity must stay secret gets an **opaque ID** and is not referenced by non-DM records"); apps/web/AGENTS.md:147-150 ("…never its ID"); ADR 0027 ("unidentified objects stay unidentified").
Note: the **client UI is sound** — no goblin ID appears in the rendered DOM text, attributes or aria-labels (only the legitimate party-knowledge id `goblin-hypothesis`). The leak is in the server projection, not the client rendering; the e2e `not.toContainText('goblin')` check cannot catch it because it only reads visible text, not the network body.
Fix: seed secret-identity creatures with opaque IDs (per ADR 0008 §50), or have non-DM projections substitute a per-perspective opaque handle for any entity whose `name` is withheld (combatants, order, scene, context).

**G06-client-02 — Low (uncertain) — Unidentified creatures are distinguishable before identification.**
The player scene projection carries, per unidentified creature, `equipment` and a reference-image `contentHash`: goblin-shaman `["dagger"]` vs raiders `["scimitar","shortbow"]`, and a distinct image hash for the shaman. Even with opaque IDs this lets a player single out the caster pre-identification. May be intended as in-fiction observable (you see the weapon it holds); flagged for the owner, not asserted as a breach. Evidence: `net/player-scene-leaks-goblin-ids-and-equipment.json`.

## Checked and sound
- **Live fingerprint side channel (my core area):** opened player + DM `fetch` streams; a DM **secret-only** commit (`CreateEntity`, hidden & unplaced) produced a `changed` on the DM stream and **none** on the player stream; a control `MoveCombatant` of a visible combatant produced a player `changed`. So "a secret-only commit cannot change the fingerprint" (ADR 0033 / STAGE_310_DESIGN) holds. Evidence: `net/fingerprint3-timeline.txt`, `net/player.raw`, `net/dm.raw`.
- **XSS / HTML injection:** DM renamed a player-known entity to `<img src=x onerror=window.__xss=1>Караван`; delivered verbatim in the player's `entities`/`knowledge` bodies, but React escaped it — `window.__xss=0`, zero `img[onerror]`, no `img[src=x]`, no CSP violation. DM-authored **descriptions do not reach the player at all** (entity context omits them). Evidence: `net/player-knowledge-xss-name.json`.
- **CSP / headers:** shell `/` → `default-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`; API responses carry the documented server policy (`frame-ancestors 'none'; base-uri 'none'`), plus `referrer-policy: no-referrer`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, COOP same-origin, locked `permissions-policy`. No `securitypolicyviolation` fired in the browser.
- **Cross-perspective reads (as player):** `knowledge?perspective=DM` / `NPC:mira-vale` / `CHARACTER:captain-thorne` / `CHARACTER:mira-vale` / `CHARACTER:goblin-shaman` → **403**; `PUBLIC`/`PARTY` → 200 (legitimate). Other characters' `/sheet` → 404, own → 200.
- **Uniform absence:** hidden item `goblin-weapon` and a nonexistent ID both → 404 on `/context` and `/sheet`.
- **DM-only routes (as player):** `/invitations` 404, `/authoring/proposals` 404, `/ai/intents` (GET) 404, `/encounter/suggestion` 403. `/sessions` → 200 but returns only narrative session metadata (title/time), no roster, roles or tokens.
- **Client storage (ADR 0026):** after load, `localStorage`/`sessionStorage` empty, no IndexedDB databases, session token absent from storage and DOM; session cookie `Path=/api; HttpOnly; SameSite=Strict; Secure`.

## Coverage
HTTP projection bodies for every player-readable route (session, surroundings, knowledge, entities, quests, encounter, scene, chronicle, memories, assets, context, sheet) at baseline and mid-combat; perspective-parameter abuse; DM-only route probing; uniform-absence; `/sessions` presence; the live change-signal side channel (secret vs visible commit, DM vs player stream); XSS via DM-authored name & description; CSP/security headers on shell and API; browser DOM/attribute scan, client storage, and an in-browser fetch proving delivery.

## Limits
- bfcache / perspective-switch memory (DM switching to Elowen and Back/Forward restoration): the app's storage was verified clean and the `pagehide/pageshow→probe()` logic was read in source, but I did not reproduce a full DM→player→back navigation in the browser — partial.
- I did not drive a DM-audience image approval or AI/authoring draft as change-signal inputs (PAID routes left unset per brief; AI stayed offline) — the secret-only test used `CreateEntity`/placement instead, which is an equivalent DM-only commit.
- `RecordMemory`/`ChangeEntityStatus` probes hit schema validation (400) and were not used as signal inputs.
- Single-table deployment on Docker Desktop (all clients share one source IP); timing/load side channels are explicitly out of the design's promise and were not pursued.
