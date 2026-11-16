# Campaign distinctness rework

Authority: owner request of 2026-11-09, «Нужно проработать кампании чтобы они не повторяли друг
друга. Мне не нужен эффект, когда игроки думают что играют в то же самое». Follows the audit
`reports/CAMPAIGN_PLAYABILITY_AUDIT_2026-11-09.md`. No numbered product stage begins.

## Goal

A table that plays two campaigns from this library must not feel it played the same adventure.
What differs: what players mainly do, session rhythm, opening, turning point, how the truth comes
out, climax, how the outcome is decided, fights and maps. Names and scenery alone do not count.

## Scope

The plan is `campaigns/distinctness/MATRIX.md` and `matrix.json`: 53 distinct play types.

- Tier A (11, the two strongly repeating groups): new sequence of play. Title, setting and core
  cast stay; truth, clues, NPC knowledge, handouts, encounters and endings change as needed.
- Tier B (19): the repeated stretch and the finale are rewritten.
- Tier C (23): finale, session rhythm and fights; the plot skeleton stays.
- Every tier: leave the repeated closing procedures (reconcile, outcome table, a round of
  personal epilogues, an end-of-evening circle) only where the matrix assigns them.
- Fights: SRD stat blocks and per-encounter battlefields from the matrix, replacing the single
  block and the single 14x12 grid. Audience ratings and table-safety guidance stay.
- Tools under `scripts/*` may stop forcing eight sessions, three scenes and three foes. Packages
  are rebuilt; the quest journal is fixed while rebuilding (17 campaigns lose quests today).
- Family campaigns keep their art, places and people; the pictures must still match.

Waves run A, then B, then C. Art, new items and porting the import to `main` are separate work.

## Boundaries

`campaigns/distinctness/previous-sources-2026-11-09.tar.gz` holds all sources from before the
rework; the campaigns are untracked, so never delete it. No commit, push, deployment, real
activation or database change without the owner's word. Paid provider calls only after the
owner's explicit decision and within its ceiling; record real usage and cost per campaign.

## Verification, for every wave

1. Source validators, package build for every party size, existing campaign tests.
2. Engine playthrough of every package: places, clues, NPCs, quests, all fights to the end.
3. Browser journey for a sample of each wave; rendered book pages checked.
4. An independent comparison of the whole library at Opus 5.5 max, without earlier assessments.
   A wave passes only with no HIGH cluster among its campaigns and no new one created elsewhere.
5. Report actual results, including what still repeats, in
   `reports/CAMPAIGN_DISTINCTNESS_REWORK_2026-11-09.md`. Human play remains unverified.

## Status

2026-11-09 16:00, paused by the owner. The text is written by Claude Opus 5.5 in-session without
provider calls (owner's choice). Ready: the matrix, `AUTHOR_BRIEF.md`, the tools in `scripts/*` and
`scripts/campaign-shared/` (their tests pass), all packages rebuilt with the journal fix.
No campaign is finished. `noir-2026/false-verdict` is half-rewritten: `world`, `cast`, `clues`,
`handouts`, `encounters` and `case` are new, the four `sessions-*.json` are old, so it fails
validation until finished or restored from the archive. The other 52 sources are unchanged.

2026-11-13: the owner chose to develop campaigns one at a time in depth, starting with `moon-pearl`
(chosen with seven others as the strongest candidates). Moon Pearl is done: `campaigns/distinctness/
moon-pearl-brief.md`, `reports/MOON_PEARL_REWORK_2026-11-13.md`. Shared fight tooling now lives in
`scripts/campaign-shared/` and the family tools use it. `false-verdict` is still half-rewritten.

2026-11-13/14: `collection-2026/sky-archipelago` done (`campaigns/distinctness/sky-archipelago-brief.md`,
`reports/SKY_ARCHIPELAGO_REWORK_2026-11-13.md`). Owner's role split for this and later campaigns: skeleton
and editing by Opus 5.5 high, all JSON by Sonnet 5.5 high over the project API (ceiling $30 per campaign;
actual $4.79 booked, of which $1.64 are two transport failures at worst case), two independent Opus 5.5
high critics (logic; a DM preparing to run it), art by OpenAI image generation through Codex CLI.

2026-11-14: `collection-2026/clockwork-carnival` done with the same role split (`campaigns/distinctness/
clockwork-carnival-brief.md`, `reports/CLOCKWORK_CARNIVAL_REWORK_2026-11-14.md`); Sonnet spend $3.95 of the
$30 ceiling, no transport failures.

2026-11-14: `fantasy-2026/mountain-wedding` done with the same role split
(`campaigns/distinctness/mountain-wedding-brief.md`, `reports/MOUNTAIN_WEDDING_REWORK_2026-11-14.md`).
The Sonnet writer, the art tools and the art test moved to `scripts/campaign-shared/` with a series
registry (`series.ts`: `collection-2026`, `fantasy-2026`); the fantasy tools gained `items.json` and
pictures in their books.

2026-11-14: `dark-fantasy-2026/marrow-crown` done with the same role split
(`campaigns/distinctness/marrow-crown-brief.md`, `reports/MARROW_CROWN_REWORK_2026-11-14.md`); the
dark-fantasy tools joined the shared series registry (items, pictures in books, Sonnet writer).

2026-11-14: `dark-fantasy-2026/salt-widows` done with the same role split
(`campaigns/distinctness/salt-widows-brief.md`, `reports/SALT_WIDOWS_REWORK_2026-11-14.md`).

2026-11-14: `collection-2026/last-orbit` done with the same role split
(`campaigns/distinctness/last-orbit-brief.md`, `reports/LAST_ORBIT_REWORK_2026-11-14.md`); the Sonnet
writer now lets every parallel request finish when one answer is rejected.

2026-11-14: `noir-2026/rain-check` done with the same role split (`campaigns/distinctness/
rain-check-brief.md`, `reports/RAIN_CHECK_REWORK_2026-11-14.md`); the noir tools joined the shared
series registry (items, pictures in books, Sonnet writer with a `case` job). All eight candidates picked
on 2026-11-13 are now reworked.

2026-11-16: owner decision — the 45 remaining campaigns are reworked in cloud sessions, the writer is
Claude Opus 5.5 high in-session (no Sonnet, no paid calls), art later (prompts and `style.txt`
prepared, nothing generated), a pilot with the rest of `collection-2026` first. `collection-2026/
velvet-ledger` done (`campaigns/distinctness/velvet-ledger-brief.md`, `reports/VELVET_LEDGER_REWORK_
2026-11-16.md`); not added to `fixtures/campaign-library/`. The collection tools now allow fewer than
eight evenings (books test, stale evening pages, map titles); packages must stay under the web import
limit of 512 KiB.

2026-11-16: `collection-2026/hollow-choir` done the same way (`campaigns/distinctness/hollow-choir-brief.md`,
`reports/HOLLOW_CHOIR_REWORK_2026-11-16.md`): one night in six evenings of five scenes.

2026-11-16: `collection-2026/winter-caravan` done the same way (`campaigns/distinctness/winter-caravan-brief.md`,
`reports/WINTER_CARAVAN_REWORK_2026-11-16.md`). Paused at the owner's request after it:
`salt-meridian` is a tuned draft before critics; `ash-testament` has its brief only.

2026-11-16: resumed at the owner's request. `collection-2026/salt-meridian` done the same way
(`campaigns/distinctness/salt-meridian-brief.md`, `reports/SALT_MERIDIAN_REWORK_2026-11-16.md`): a
blockade run under an alarm track, ending in the breakthrough of the Three Mouths.
