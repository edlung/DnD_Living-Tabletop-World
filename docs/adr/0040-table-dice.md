# ADR 0040: Dice at the table — server rolls, a table log, 3D dice in the client

Status: Accepted (owner-delegated product decision 2026-11-01; `reviews/OWNER_PRODUCT_COMPLETION_2026-11-01.json`)

## Context

The owner asked for dice that roll across the interface with their own sound. Rules already roll
on the server (ADR 0011: `Dice`), and events record every die; the client showed only numbers.
Tables also need rolls the rules engine does not resolve: free rolls, checks the DM asks for.

## Decision

1. **Every die is the server's.** World rolls are read back from the event log (`apps/server/src/dice/
world-rolls.ts`); table rolls (free dice, checks, saves) are rolled by the server with the
   canonical sheet's bonus (`@ltw/rules`). The client never decides a number.
2. **Table rolls are not world history.** They live in `ltw_table_rolls` / `ltw_check_requests`
   (migration 0025): append-only rolls, requests that only go from open to rolled or cancelled.
   They change nothing in the world; the DM decides what a roll means.
3. **Visibility.** The DM sees every roll. A character's player sees its own world rolls and the
   table's public rolls by characters it knows (names only as its knowledge allows); the DM's hidden
   rolls, monsters' rolls and initiative (ADR 0015 §6) stay the DM's. A requested check's DC and its
   success are the DM's; the roll's total is the table's.
4. **Presentation.** The client animates each roll new to it from the feed: 3D dice (three.js,
   cannon-es, loaded on demand) simulated first, then relabelled by one face swap so the face they
   land on shows the server's value; synthesized impact sound per bounce. Per-viewer settings for
   sound, volume and motion (browser storage, a convenience); reduced motion shows only the result.
   Players' dice are GPT obsidian with gold numerals, the DM's GPT ivory with dark ink.

## Consequences

- The live fingerprint covers `rolls` and `check-requests`, so every viewer's dice follow at once.
- Rolls survive restarts (PostgreSQL) and appear in a per-campaign log (latest 30).
- A third-party 3D stack enters the client (MIT), only in a lazy chunk.

## Amendment 2026-11-01 (Stage 530, owner-delegated): rests at the table

- The DM's open short rest is table state beside the rolls (`ltw_rests`, migration 0026): at most one
  open per campaign (a partial unique index), never canonical history. A fight hides it and refuses
  spending; a long rest closes it.
- What a rest does to a character is a `SetCharacterSheet` the rules computed (`@ltw/rules`
  `longRest`, `spendHitDie`, `levelUp`), recorded through the World Engine by the table's system
  actor (`table`, as sign-in records a seat, ADR 0036 §4) with command IDs `rest:`, `hit-die:` and
  `level:` plus the client's `requestId`, so a retried request is `duplicate`. Time passes with
  `AdvanceWorldTime` (an hour, eight hours). These commands are not the DM's `http:` commands, so
  the DM history lists none of them.
- A spent Hit Point Die is a table roll (`subject: hit-die`): the server rolls it, the feed shows it
  and the client throws it like any other die. The live fingerprint covers `rest` for the DM and an
  acting character.
