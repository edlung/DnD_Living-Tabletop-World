# Stage 880 completion — sealed envelopes

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/59 (draft, stacked on Stage 870's,
https://github.com/edlung/DnD_Living-Tabletop-World/pull/58).

Work order `work-orders/STAGE_880.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 880); ADR 0073
§9; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch
`claude/stage-880-sealed-envelopes`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **"Seal in an envelope"** on a handout kept in the DM's library: words for the outside ("Open
  after the battle", "For the bravest") and what opens it — the DM's word, or by itself when the
  evening's chapter is written. The envelope takes a copy: changing the kept handout later does
  not change it.
- **The party sees the envelope, not the inside.** The Journal lists each sealed envelope by its
  outside. Opened, it arrives as any handout does, to the whole party.
- **The DM's list** in the Party sheet: the outside, what is inside, what opens it; "Open it now"
  and a delete that asks first and says what it does.
- **The chapter opens it.** A chapter told from the party, written for the evening the envelope
  names, opens it in the same request. An evening that ends with no chapter leaves it sealed.
- **Table data beside the world** (migration 0047, additive): no event, no world state, no
  knowledge change; it moves with a campaign and is in the live inventory.
- **Session's decisions**: an envelope is for the party (one for a single hero is a handout
  given to them); the evening is the one open at the sealing, or the next one; no cast to the
  table's screen; an envelope whose picture the party does not know yet stays sealed and says why
  to the DM; fifty a campaign. All of ADR 0073 §9.

## Found and fixed on the way

- **Sealing looked like a failure though it had worked**: the server answered "created" with no
  body and the client takes that for an error — the DM read "could not be sealed" over an
  envelope that was sealed. The answer has a body now; the journey would have caught it and did.
- **From the independent UX, copy and accessibility pass** (a reviewing subagent, reading the
  source), one blocker: "Delete" on a sealed envelope was one unguarded press beside "Open it
  now", and said nothing afterwards. It asks first now ("It leaves the party's Journal and never
  opens"), an opened one says the party keeps the handout, the list says "Envelope deleted" and
  takes the focus. Also: the form stood under the card's own buttons; it did not say it takes a
  copy, what a picture inside means, or what "the evening" is when no game is on; focus was lost
  on sealing and cancelling; errors were styled as hints.

## Verification

| Check                                                                                                                   | Result                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                                                       | pass                                                                            |
| Lint                                                                                                                    | pass on the files changed since Stage 870; the whole repository is linted by CI |
| Unit tests                                                                                                              | pass — 599 files, 4801 tests                                                    |
| Integration tests (PostgreSQL 16)                                                                                       | pass — 85 files, 408 tests                                                      |
| Build                                                                                                                   | pass                                                                            |
| Journeys, Chromium: `envelopes` (three, one of them at the iPad's size), and the neighbours `handouts` and `library`    | pass                                                                            |
| The sealing form, the DM's list, the delete question and the Journal at 1440, 768, 390, 320 and 832×400, both languages | looked at, 40 screenshots                                                       |
| Independent UX, copy and accessibility pass                                                                             | done from the source; findings above, fixed                                     |

**Adversarial pass against the boundary.** The inside of a sealed envelope — its title, words
and picture — is in no answer below the DM: the party's read holds the outside and what opens
it, for a player, for the party's view, for the DM asking that route and for a display (unit
tests over HTTP; the journey also reads everything the player's page was sent and finds none of
the letter's words before it opens). Only the DM seals, opens and deletes (a player and a
display get 403, a stranger to the campaign 404 without learning it exists). Opening gives one
handout however often it is asked. Only a chapter told from the party opens an envelope — a
chapter told from the DM or from one character does not. An envelope whose picture shows
something the party does not know does not open, so opening cannot hand the party a face or a
place early. Nothing is written to the world; no AI is called.

## Not verified

- **The whole browser suite was not run on this branch** in this environment; the pull
  request's CI runs it.
- **WebKit**: not installed here. The journey is in the `ipad` list and runs there in CI only.
- A screen reader's actual announcements in the DM's list.
- Whether children find a sealed envelope exciting or only confusing: the family's to say.

## Checkpoint 3 — Stages 860–880

**Done.** Three more stages, each in its own draft pull request, each with its report:

| Stage                                 | Pull request                                                | What it gives                                                             |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| 860 A shorter way in for a guest      | https://github.com/edlung/DnD_Living-Tabletop-World/pull/56 | the table's link shows the heroes to pick from; no contract, no migration |
| 870 Theatre of the mind on the screen | https://github.com/edlung/DnD_Living-Tabletop-World/pull/58 | a picture with words to read aloud; no migration                          |
| 880 Sealed envelopes                  | this one                                                    | a handout the party sees from outside until it opens; migration 0047      |

**Merge order.** The earlier package (pull requests 37–44, 46 and 47) and the apps' polish (32)
were merged into `main` on 2026-11-16, while this stage was being verified; `main` is merged
into every branch of this program, and the plan's pull request now points at `main`. So, in
order: 48 (the plan), 49, 50, 51, 52, 53, 55, 56, 58, this one. Each is stacked on the one
before. Migrations in order: 0044 (800), 0045 (840), 0046 (850), 0047 (880); each is additive.

**Not verified, across the three.** WebKit locally (CI only); the whole browser suite on these
branches outside CI; a real television across a room; a guest's real phone at the table's link;
the family at a real table.

**CI.** When this was written, pull requests 55 (Stage 850) and 58 (Stage 870) were green on their current heads. Pull request 56 (Stage 860) was red in one WebKit journey this stage does not touch (`evening-ritual` on the iPad: the player's screen did not show the lobby within fifteen seconds of the evening's end); the same journey passed in pull request 58, which holds all of Stage 860's code. Stage 800's journey raced the page's own reload on the iPad; that is fixed in pull request 49. That fix and `main` are merged up the stack as this is written, which runs CI on every branch once more; what it answered is in Stage 890's report or in the pull requests themselves.

**Still to come.** Stage 890 ("I'll come / I can't") is written and reviewed in source; it is
verified and opened next, and its report closes the program.

## For the owner

Merge after pull request 58 (Stage 870). Migration 0047 is additive. The checks above ran
before `main` was merged in; after it they were repeated on Stage 890's branch, which holds all
of this one, and this branch's own run is CI's. Only the owner can: merge, deploy, and seal a real letter for a real evening.
