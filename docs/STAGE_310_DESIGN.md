# Stage 310 design — draft 2 (adopted)

Date: 2026-10-15. Status: ADOPTED by the session under the owner's delegation
(`reviews/OWNER_DECISIONS_9_2026-10-15.json`, "Иди дальше без остановок"); the owner may amend it.
Scope: `work-orders/OPUS_STAGE_310.md`. Decision record: `docs/adr/0033-live-session.md`.
Draft 1 (2026-10-11) is superseded; its contracts are kept unless changed below.

## Owner decisions (Q9)

- The DM may skip an absent player's turn or act as that character (owner, 2026-10-11).
- Hidden changes reveal nothing, including through notifications.
- Presence is not proof of absence and never transfers authority: the DM chooses explicitly.

## A. Change signal

**Transport.** `GET /campaigns/:campaignId/live?perspective=<p>[&focus=<entityId>][&place=<locationId>]`
streamed with `text/event-stream` framing and read by the client with `fetch` (never
`EventSource`), so the credential stays in the `Authorization` header. The fixed check order of
ADR 0009 applies (401 → 400 → 404 → 403) before the stream opens. No credential, global event
position or world version appears in the URL, a message, browser storage or a log.

**Messages** (fixed schema, never world content):

- `ready` — the subscription is registered and its baseline taken; the client reloads.
- `changed` with `{"seq": n}` — something this subscription may read changed; `n` counts this
  subscription's own signals only.
- `closed` with `{"reason": "unauthenticated" | "forbidden" | "gone" | "overloaded" | "shutdown"}` —
  the stream ends; the client does not retry on `unauthenticated` or `forbidden`.
- A comment heartbeat every 15 s, independent of commits.

**What a change is.** Every subscription has a fingerprint: the SHA-256 of the bodies of the
same HTTP views the client reads, obtained by injecting GET requests with the subscriber's own
credential and perspective into a second, silent instance of the same Fastify application. Each
view therefore goes through the existing authentication, check order, membership, perspective and
projection code; nothing new decides what a perspective may see, and raw state, history, hidden
identifiers or event metadata are never hashed. A secret-only commit cannot change any of those
bodies, so it cannot change the fingerprint.

Coverage inventory (views fingerprinted per subscription):

| View                                                                                   | When                   |
| -------------------------------------------------------------------------------------- | ---------------------- |
| `session` (unscoped), `sessions` (unscoped)                                            | always                 |
| `entities`, `knowledge`, `memories`, `encounter`, `quests`, `chronicle`, `presence`    | always                 |
| `surroundings`                                                                         | character perspectives |
| `chronicle/suggestions`, `dm/history`                                                  | DM perspective         |
| `entities/:focus/context`, `entities/:focus/knowledge`, `entities/:focus/presentation` | with `focus`           |
| `locations/:place/scene`                                                               | with `place`           |

AI ranking and replies never run during a comparison (the context view's default deterministic
ranking is used; `ranking=ai` is never requested). Query-dependent views outside the inventory
(a memory's flashback, a recall query, a target's context) are re-read on any signal while shown.

**Cadence.** A single loop runs every 1,000 ms; each subscription is compared at most once per
cycle and cycles never overlap. A change is emitted at the cycle that observes it, so emission
times are quantised to the cycle and do not depend on when a commit happened. Compute cost may
vary with load; this design promises protocol non-disclosure, not constant-time execution.

**Recheck.** Every cycle reuses the full check order through the injected requests: a 401 closes
the stream with `unauthenticated`, a 403 with `forbidden`, a 404 with `gone`. A failure to compute
a fingerprint closes the stream (`gone`); it never emits a signal and never continues unchecked.

**Bounds.** At most 4 subscriptions per actor per campaign and 200 per process (`overloaded`
beyond); focus/place IDs must match the object-ID pattern; slow consumers whose buffer exceeds
64 KiB are closed. Streams close on client disconnect and on server shutdown.

**Subscribe/read race.** The server takes the baseline before it sends `ready`; the client reloads
its views on `ready`, so it never holds data older than the baseline. A focus or place change opens
a new subscription and closes the old one only after the new one is `ready`, then re-reads the
focused views.

**Client.** One live connection per screen, owned by the session; reconnect with exponential
backoff (1 s doubling to 30 s, ±20 % jitter) and reload on reconnect; duplicate and late signals
coalesce into one background refresh per 150 ms; a refresh keeps the shown data until the new data
arrives (no loading flash), never replaces drafts, focus or unsubmitted DM intent, and its stale
results are discarded by the existing generation guard. A connection badge shows live,
reconnecting or offline. The manual "Refresh world" stays.

**Presence.** `GET /campaigns/:campaignId/presence?perspective=<p>` returns, for the characters
in the perspective's own `entities` view, whether their controlling player has a live
subscription, plus whether the DM is connected. No actor ID, no roster entry the perspective
cannot already see, no hidden character. Presence follows live subscriptions with a 10 s grace
after the last one closes (absorbs reconnects); several tabs count once. Presence is shown, never
used to decide anything.

**Whose turn.** The encounter view already names the current combatant; the client shows "your
turn" or the combatant's name prominently, and the reaction prompt appears through the signal.

## B. DM substitution

The kernel already authorizes the DM to issue player commands for any character (authority `dm`,
ADR 0013); every stored command records its issuer. Stage 310 adds no new authority:

- In combat, when the current combatant is a player character, the DM's controls offer
  **Skip the turn** (the existing `EndTurn` for that combatant, with its next-turn effects; it
  cannot bypass an open reaction window, which the kernel already refuses) and **Act as <name>**,
  which shows that character's existing combat actions to the DM and submits them unchanged.
- The DM states a reason (absent / asked the DM / other, with optional text up to 200 characters).
  The reason is recorded in a DM-only audit table keyed by the command ID
  (`ltw_dm_substitutions`, migration 0009) before the command is submitted; it is descriptive
  metadata, not canonical. The canonical record is the stored command with the DM as issuer.
- Undo is the existing `UndoCommand` with its blockers.
- A player can never invoke any of this: the kernel already refuses a player acting for another
  character, and the audit endpoint is DM-only.

## C. DM history and day controls

`GET /campaigns/:campaignId/dm/history?perspective=DM[&before=<sequence>]` (DM only; 404 for a
non-DM, ADR 0009 order) lists, newest first, 20 per page:

- authoring commits (`ApplyAuthoring`), with the proposal's summary, and
- DM substitutions (player commands the DM issued for a roster character), with the stored reason,

each with its canonical status (committed / undone, from the stored commands and
`CommandUndone` events) and, if committed, whether undo is possible now (the kernel's own
blockers, computed by a dry decision). Undo goes through the existing routes. The list is derived
from durable history and durable proposal and audit data, so it survives reload; it is requested
only with the DM perspective and is never shown in a lower perspective, including to the DM
viewing as a character. It replaces the screen-local undo of ADR 0029 §8.

The day-advance control derives its label from the current world time: it offers the next day's
morning (Day N+1, 10:00), never a day already reached.

## Evidence required

`pnpm validate` with no live provider call. Two-browser journeys: a combat turn hand-off; the DM
opens a Counterspell window that the player answers without refreshing; private authoring that the
player sees only after publication; the DM skips an absent player's turn and acts as the
character; reconnect converges. Server tests: the fingerprint is unchanged by secret-only commits
for every non-DM perspective while the DM's changes; 401/403/404 during a stream close it;
duplicate/out-of-order/stale-generation signals are harmless on the client; caps and slow-consumer
closure; presence filtering; DM history isolation, pagination and undo status; substitution
audit is DM-only. Gate 06 coverage rows record the new surfaces.
