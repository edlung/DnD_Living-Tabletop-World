# Campaign library release, 2026-11-14

Owner request (2026-11-14, Russian, verbatim): «Давай закроем все пробелы» — after the session listed
what the eight reworked campaigns still lacked for full play: drawn battle maps, the NPC manner of
speech in the game's AI, pictures that travel with the campaign, and the library being on the server.
Owner answers in the same session: amend ADR 0020 so a one-line public manner of speech reaches NPC
dialogue («Да, поправить ADR»); bring the work to `main` through a pull request and deploy after it
(«PR в main, потом деплой»), the deploy asked for once more before it runs.

## Scope

1. **Port.** The campaign library and its tools, written on the old branch `claude/full-game-a`
   (2026-11-08 … 11-14, never committed), onto current `main`: `campaigns/` (sources, packages,
   books, runtime WebP and manifests; PNG originals stay in `~/Documents/living-tabletop-world-art/`),
   `scripts/campaign-shared/` and the series tools, the workshop's package import, the workshop
   campaigns' encounter books, reports and evidence (the five heaviest evidence folders stay local).
2. **Battle maps.** A GPT top-down battle map for every place a fight of the eight reworked
   campaigns happens, drawn over the fight's own grid layout, bound as the place's derived
   `battle-map` picture (ADR 0035 §4).
3. **The library in the product.** The workshop lists the eight reworked campaigns; a DM picks one
   and a party size into an empty draft (the same preview and save as a package file); once the
   campaign is activated, its pictures — images, figures for foes, battle maps — are imported through
   the curated-import commands as DM-approved assets, as a template's are (ADR 0058 §5). The library
   ships in the server image.
4. **NPC manner of speech.** ADR 0020 amendment; an optional one-line public `manner` on an NPC in
   the campaign package and the world, given to NPC dialogue's minimal context and its prompt; never
   secrets, descriptions or DM notes. Isolation tests.
5. **Checks and release.** Unit, integration and browser journeys, the library journey from pick to
   a fight on a battle map; pull request, CI; deploy only on the owner's explicit word.

Out of scope: the 45 campaigns not reworked (ported as files, not offered by the library), new
campaign text, a rules engine for the finales' table rules.

Invariants: the World Engine stays the only writer of state; pictures enter through commands;
knowledge isolation (Gate 04) unchanged except the amended minimal context; no paid provider calls.
