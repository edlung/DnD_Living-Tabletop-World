# World maps of the campaign library, 2026-11-17

Owner request 2026-11-17: «нужны карты мира для кампаний». Decisions and format: ADR 0058, notes
of 2026-11-17; the world map itself: ADR 0057 §10.

## What a DM gets

Starting any of the 15 library campaigns from the workshop, the DM opens «Места» and sees the
campaign's world map: a GPT map of the region from above, without lettering, in the campaign's own
style, every place of the campaign pinned on it and the routes between them with miles, terrain and
road. The DM leads the party along a route with the existing travel form (pace, hours, Exhaustion).
A player's map shows the same picture with only the places that player knows.

| Campaign           | Map place («Карта: …»)      | Pins | Routes | Miles |
| ------------------ | --------------------------- | ---- | ------ | ----- |
| rain-check         | Улицы Латрена               | 12   | 16     | 1–4   |
| last-orbit         | Кольцо станции «Нитка»      | 12   | 15     | 1     |
| marrow-crown       | Ходы Олома                  | 11   | 11     | 1–2   |
| salt-widows        | Берега Соли Отлива          | 12   | 12     | 1–24  |
| clockwork-carnival | Тракт и казино              | 10   | 12     | 1–40  |
| sky-archipelago    | Трасса Лазурного Разлома    | 9    | 8      | 3–27  |
| mountain-wedding   | Склоны Медного Венца        | 10   | 12     | 1–4   |
| moon-pearl         | Улицы Перламутра            | 12   | 16     | 1–2   |
| ember-crown        | Рудный Венец и его стены    | 9    | 10     | 1     |
| salt-meridian      | Воды Китовой Дуги           | 10   | 11     | 1–23  |
| winter-caravan     | Тракт через Инейский хребет | 9    | 8      | 2–8   |
| ash-testament      | Дороги Пепельной Межи       | 11   | 11     | 1–36  |
| glass-republic     | Улицы Витража               | 12   | 14     | 1     |
| hollow-choir       | Комнаты усадьбы             | 11   | 0      | —     |
| velvet-ledger      | Кварталы Вельтеня           | 13   | 13     | 1     |

## How it was made

- Geography from each campaign's texts (`source/world.json`, sessions, handouts): directions where
  the texts give them, distances from stated times and distances where they exist, otherwise
  estimates; a place nearer than a mile is a mile, the engine's least.
- Pictures: 15 maps by Codex CLI on the owner's ChatGPT subscription (1536×1024), each with the
  campaign's cover as its style reference and its `style` line; originals, prompts, layouts and the
  generator in `~/Documents/living-tabletop-world-art/world-maps-2026-11-17/`. The repository keeps
  runtime WebP and manifests (`assets/world-map/`).
- Places the party discovers later are not drawn on the picture players see (the crypt and the stair
  shaft of the Hollow Choir manor, the vault under the Velvet Exchange); their pins are the DM's.
- Every pin was set by looking at the picture made, with the pins and routes drawn over it.

## Deliberate limits

- The Hollow Choir map is a plan of one house: no routes, since an hour's journey between rooms would
  mislead the travel form.
- The campaigns' own `variants/` and offline books are unchanged; the library adds the map to each
  variant it ships.
- Many miles are estimates (each route's source is in the layout files of the art workspace).

## Client fix found on the way

Pin names stacked on each other on a crowded map (worst at 390 px). Each name now takes a free side,
measured as drawn; with neither free the dot stands alone (a 32 px target) and the name shows on
hover or focus; the party's place is always named (`apps/web/src/travel/pin-labels.ts`).

## Checks

`pnpm format:check`, `lint`, `typecheck`, `context-budget`, the unit suite (603 files, 4861 tests,
`library.test.ts` activates every campaign and checks its map, pins and routes), journeys
`workshop-library-map.spec.ts` (start a library campaign, the map with every pin and no stacked
names at 1440/768/390, a route travelled), `workshop-library.spec.ts`, `travel.spec.ts`; the
layout audit at 1440/768/390.
