# The table's voice in the client (`src/voice/`, Stage 695)

ADR 0060; work order `work-orders/STAGE_695.md`. Peer to peer: the server's room only introduces the
screens and relays their offers, answers and candidates; it never carries the sound.

| File              | Role                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `voice-stream.ts` | The room's event stream (`openStream('voice/stream')`, the credential never in a URL): `room`, `signal`, `closed`; a dropped stream opens again after a backoff                                                                      |
| `mesh.ts`         | `VoiceMesh`: one `RTCPeerConnection` per other speaker; of two, the smaller peer ID offers; candidates held until their description; a failed connection restarts its ICE; what is heard read from `getStats` (`hearing`, `talking`) |
| `use-voice.ts`    | `VoiceSession`, one a campaign's page (it outlives the Chat sheet): the microphone (echo cancellation, noise suppression, gain), open or push to talk, a shared room, the DM's mute and removal; `useVoice`                          |
| `voice-panel.tsx` | The Voice section above the chat, online only: join, leave, the microphone, hold to talk (pointer, Space or Enter while focused), a shared room, who is in the voice with `data-state` and `data-hearing` for tests                  |

- A screen plays a speaker unless it shares a room with another or the DM muted that speaker; the
  muted speaker's own microphone is off too, so neither side relies on the other.
- Tests: `apps/server/src/voice/*.test.ts` (the room, the routes); journey `tests/e2e/voice.spec.ts`
  (two browsers with Chromium's fake microphone; hearing proved by the connection's statistics).
