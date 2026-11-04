# 0060. Voice at the table

- Status: Accepted (owner-delegated product decision 2026-11-04; `docs/FULL_GAME_PLAN.md` Stage 695 and
  decision 8, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Opening the relay's ports on
  the shared VPS stays the owner's call (decision 8). Builds on ADR 0033 (the live session), 0036
  (production sign-in), 0044 (online play: the table's chat and its screen on every screen).
- Context: an online table talks in text (ADR 0044 §1) and sees one screen on every screen (§5); for
  their voices the players use another app. Decision 8 asks for voice built in: WebRTC audio and a TURN
  relay on the VPS, push to talk and mute, the DM's controls, the microphone's choice, a refused
  microphone explained, reconnection, echo cancellation when several devices share a room.

## Decision

1. **Who talks.** While a session plays online, the DM and the players — the campaign's members who
   hold a character, and the DM — may join the table's voice, eight at most at once; a display never
   joins. One room a campaign, open while a session plays online; leaving the online mode or ending
   the session empties it.
2. **Peer to peer: the server only introduces.** Every two speakers hold one WebRTC audio connection
   (a mesh: eight speakers make 28 connections, light for audio). The server relays the connections'
   offers, answers and candidates between two members of the same room — nothing else — over a
   stream of its own and a post (`GET …/voice/stream`, `POST …/voice/signal`), each message only to
   the member it names and only while both are in the room. It never carries the sound, which is
   encrypted between the screens (DTLS-SRTP), and nothing is recorded.
3. **The relay.** Where two screens cannot reach each other directly, a TURN relay carries their
   encrypted audio. Each member gets short-lived relay credentials from the server (`GET …/voice/ice`:
   an hour's, the HMAC of the relay's shared secret, coturn's REST scheme). Without a relay configured,
   only direct connections work (one network, or friendly routers), and the voice panel says so.
4. **A speaker's controls.** Join and leave; mute and unmute; push to talk — hold the button (or the
   Space key while the button has focus), heard only while held; the microphone's choice among the
   device's inputs. The browser asks for the microphone once: refused, the screen says how to allow it
   in the browser and still listens. Echo cancellation, noise suppression and automatic gain are on.
5. **Several devices in one room.** A screen marked "in the same room as another" plays nobody's voice
   and talks only by push to talk, so one room's devices never feed each other's speakers back to the
   table.
6. **The DM's controls.** The DM mutes a speaker for everyone (until the DM lets them talk again) and
   removes one from the room, until the room ends; both hold for the person, so a reload changes
   neither. A removed person's screen says when they may join again (the next room) and offers no
   button that could only be refused. The room lists who is in it, who talks and who is muted.
7. **Reconnection.** A connection that fails restarts its candidates; a screen whose stream drops
   joins again and renews every connection, without the speaker pressing anything.

## Consequences

- A speaker's right to the room is checked again every 20 seconds — the same sign-in, still the DM
  or a player, the session still played online, the campaign at home (ADR 0061) — and the stream
  closes when it no longer holds: a revoked seat, a deleted account or the session's end. A screen
  that stops reading its stream is dropped before its backlog grows; a person's signals are
  counted across reconnections. The relay's credentials are given only while the room is open.

- The page's `Permissions-Policy` lets the app's own origin ask for the microphone
  (`microphone=(self)`; the camera, geolocation, payment and USB stay off), in `deploy/proxy/Caddyfile`
  and its check in `deploy/verify/smoke.sh`: before, no page could ever use it.
- No migration: the room is the server's memory (who is in it, muted by the DM); a restart empties it
  and the screens join again on their own.
- The relay is a coturn container on the VPS behind the owner's OK for its ports (UDP 3478 and a
  relay range); its shared secret lives in `deploy/.env` with the others. Until then the code runs
  with direct connections only.
- Stage 695 runs in parts (`work-orders/STAGE_695.md`): the server's room, signaling and relay
  credentials; the speakers' screens; the DM's controls and reconnection.

## Invariants affected

None: voice is presentation beside the world, never in its history. The room admits only the
campaign's members with a character and its DM, as the session's routes do (invariant 9's spirit:
nobody hears a table they do not sit at).
