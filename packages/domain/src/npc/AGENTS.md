# NPC Dialogue (`src/npc/`)

Security-relevant module. Authority: `docs/adr/0020-npc-intelligence.md` §1 and §3 (owner-approved). Gate 04 attacks this path (`docs/GATE_COVERAGE.md`, Stage 130).

| Concern                                                                      | File                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Whether a character can talk to an NPC now (authorization, preconditions)    | `talk.ts`                                                       |
| The minimal context an NPC speaks from; trace sources; what a command shared | `dialogue-context.ts`                                           |
| Disclosure rule (shared with `AskAbout` and Insight)                         | `../investigation/disclosure.ts`                                |
| Tests: contents, names, sources; Talk; the Gate 04 isolation matrix          | `dialogue-context.test.ts`, `talk.test.ts`, `isolation.test.ts` |
| Test support: the planted markers of `fixtures/ravenford/npc-boundary.json`  | `testing/boundary.ts`                                           |

Rules:

- Isolation is by construction: put into the context only what the NPC may say to this speaker now. Never instruct a model to keep something secret instead of leaving it out.
- Never add to the context: SECRET records, guarded content, WORLD_TRUTH, DM notes or descriptions, claims, clues, other holders' records or memories, names the speaker does not know, or anything after the world clock. A new kind of item needs ADR 0020 first and an entry in `isolation.test.ts` and `npc-boundary.json`.
- Sayable records come only from `npcDisclosure` (§2) plus what the NPC has told the speaker's scope; never re-implement the rule here.
- Entity names appear only for entities the speaker knows (`Acting.known`); otherwise kind only.
- Every line keeps its `sourceId` for the trace. The AI gateway renders names and sentences only; no ID may reach a provider.
- Talk records nothing. It is authorized like a player command (`authorizeActingFor`) and checks `AskAbout`'s preconditions in the same order, so a refusal reveals no more than a command's rejection.
