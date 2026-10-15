# Stage 330 — identity of the curated Ravenford set

- Date: 2026-10-16. Checked by the session (visual comparison of every derived picture with its
  canonical reference, side by side at equal size); not a human judgement and not a metric.
- Set: `fixtures/ravenford-ru/assets/manifest.json` — 45 GPT-made pictures (OpenAI image model via
  Codex CLI on the owner's ChatGPT subscription, owner decision Q6). Derived pictures were generated
  with the canonical reference attached as the input image (ADR 0035).
- Criteria: people — face, hair, build, costume, palette, silhouette; places — architecture,
  composition, viewpoint, landmarks; objects — shape and material. "Holds" means a player would take
  the two pictures for the same person or place.

## Canonical references (look taken from the owner's concepts where a concept shows it)

| Entity                            | Reference            | Matches the owner's concept                                                                      |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| Эловен (Elowen Starwhisper)       | portrait             | yes — platinum-blonde elf, green hooded cloak, leather armour, longbow (concepts 02, 06)         |
| Мира Вейл (Mira Vale)             | portrait             | yes — braided brown hair, green bodice, cream blouse (concept 07)                                |
| Орин Камнебород (Orin Stonebeard) | portrait             | yes — braided red-grey beard, brass goggles, leather apron (concept 04)                          |
| Капитан Торн (Captain Thorne)     | portrait             | yes — dark hair, trimmed beard, steel cuirass (concept 07)                                       |
| Goblin raider, goblin shaman      | portraits            | no concept shows them; style only                                                                |
| Eight places, five objects        | scenes / close views | style from the concepts; the square and Orin's shop take their character from concepts 07 and 04 |

## Derived pictures

| Picture                                 | Holds                            | Notes                                                                                                                                                               |
| --------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ravenford — night, rain                 | yes                              | same river, bridge, castle, path                                                                                                                                    |
| market-square — night, rain, night-rain | yes                              | same fountain, stalls, guild hall, keep                                                                                                                             |
| golden-stag-inn — night, rain           | yes                              | same façade and stag sign                                                                                                                                           |
| orins-alchemy — night                   | yes                              | same shopfront and flask sign                                                                                                                                       |
| orins-alchemy — rain                    | yes, minor drift                 | the hanging sign lost its flask symbol; the shopfront is unchanged                                                                                                  |
| merchant-guild — night, rain            | yes                              | same hall, doors, banners                                                                                                                                           |
| north-gate — night, rain                | yes                              | same towers, portcullis, guard post                                                                                                                                 |
| old-trade-road — night, fog             | yes                              | same bend, boulder, lantern, carts                                                                                                                                  |
| old-trade-road — battle map             | yes (by design a different view) | top-down road through the same autumn scrub; carts, boulder and ditch omitted on purpose — the board places cover and difficult ground from the encounter's squares |
| abandoned-caravan-site — night          | yes, after two regenerations     | the first two showed lit lanterns in the wagons (a false sign of presence at an abandoned camp); the third, lit by moonlight only, is the one shipped               |
| elowen-starwhisper — wounded            | yes                              | same face, hair, cloak; torn sleeve, bandaged arm                                                                                                                   |
| goblin-raider — wounded                 | yes                              | same face, blade, shield; cuts and blood                                                                                                                            |
| goblin-shaman — wounded                 | yes                              | same face, hood, staff; cuts and blood                                                                                                                              |
| figures (all six)                       | yes                              | same hair, costume and palette as the portraits, on a round stone base                                                                                              |

## Rejected pictures (kept outside the repository with the originals)

- `tracks`: the first object picture showed tread-soled boot prints — an anachronism and a clue the
  investigation must earn ("the attackers were not simply goblins"). Replaced by `wagon-tracks`:
  wheel ruts and blurred hoofprints only.
- `abandoned-caravan-site--night` (two attempts): lit lanterns in the wagons.

## Limits

Identity was judged by a language model looking at downscaled pictures; drift in small details
(a sign, a buckle) can pass unnoticed. Recurring-character drift in images the DM generates in play
(OpenRouter) is not covered here; those images reach players only after the DM approves them.
