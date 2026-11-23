# Campaign text standard (D&D 5e, Russian)

Owner request 2026-11-23: every campaign's texts are adapted to D&D, follow good adventure-writing
practice so the DM reads and runs them easily and nothing gets in the players' way, and stories,
dialogue and narration are not short — players want good stories, facts and lore to get into the
world. Texts are written by the session model itself, not through an API. Checked by
`python3 -B scripts/campaign-text/audit.py`; mechanical terms are fixed by
`python3 -B scripts/campaign-text/fix_terms.py`. The second round of the same request (a read-aloud
for every scene, the reading of every evening as the DM, the DM's pocket) is §5–8.

## 1. Rules language

Rules words follow the app's glossary `packages/rules/src/srd/ru/terms.json` (SRD 5.2):

| Write                                 | Not                               |
| ------------------------------------- | --------------------------------- |
| `Мудрость (Внимательность) Сл 12`     | `СЛ 12`, `DC 12`, `Восприятие`    |
| `Интеллект (Анализ)`                  | `Расследование` as the skill      |
| `Уход за животными`, `Магия` (Arcana) | `Обращение с животными`, `Аркана` |
| `КД 13`, `12 хитов`, `1d8 + 2`        | `КБ 13`, `12 HP`, `1к8+2`         |
| `спасбросок Ловкости Сл 13`           | `спас-бросок`                     |
| `НИП` or the person's name            | `NPC`                             |
| `вечер 2`                             | `в. 2`                            |

A check line names the ability and skill, the difficulty, what success gives, what failure costs,
and a no-roll path; the book reads it as fields (`scripts/campaign-library/book/check-line.ts`).
Conditions use the glossary names (`Схвачен`, `Сбит с ног`, `Испуган`…).

## 2. What the DM reads

- Lead with the situation: where, who is present, what they want, what happens if nobody acts.
- No internal keys (`station-map`, `march-sheet`) in prose: name the handout, clue, place or
  person as the DM will say it — раздатка «Мачты Пепельной Межи», улика «Маршевый порядок».
- Numbers carry units (минуты, клетки, футы, хиты); no private shorthand.
- Secrets stay in DM fields (`truth`, `secret`, `dmNote`, `unlock`) and never in player text.

## 3. What the players hear (boxed text)

`opening`, `readAloud` (the evening's and each scene's), `ending`, location `description`, clue
`appearance`, handout `text`.

- Present tense; «вы» only for what the heroes perceive. Never decide what the heroes feel, think,
  say or do. No dice, difficulty, hit points, rounds or squares.
- Two or three senses, concrete facts: what the place is, who lives there, what happened here
  before, what people say about it. A player who listens learns something true about the world.
- End on an open situation — someone speaks, something moves, a choice is in front of them.
- Original prose per campaign in its own voice and genre; no secrets the heroes cannot know yet.

Length targets (Russian words), so the story is not cut short and still reads aloud in one breath:

| Field                                                                           | Target  | Minimum |
| ------------------------------------------------------------------------------- | ------- | ------: |
| campaign `opening`                                                              | 220–360 |     200 |
| session `readAloud`                                                             | 120–230 |     110 |
| scene `readAloud` (§5; refused under 50 or over 130)                            | 60–120  |      50 |
| session `ending`                                                                | 50–120  |      45 |
| location `description`                                                          | 35–90   |      30 |
| clue `appearance`                                                               | 20–55   |      18 |
| handout `text` (a document)                                                     | 70–260  |      60 |
| NPC `voice` (where the series has it; ≤ 200 characters, it is the NPC's manner) | 14–28   |      12 |
| scene `play`                                                                    | 110–260 |     100 |

Each scene's `play` gives NPCs real lines in «…»: their manner, a fact about the place or its past,
a rumour or a piece of local lore the heroes can ask about — the dialogue is how players learn the
world. A rules card handout may be shorter than 60 words.

## 4. Rewriting a campaign

1. Read the campaign's `README.md` and `AGENTS.md` (age band, which numbers are tied to models),
   then `python3 -B scripts/campaign-text/dump.py <series>/<slug>` (or `--part sessions` etc.).
   Every line is an address: `sessions-1.json#[0].scenes[1].play`.
2. Write a patch file `{address: new text}` and run
   `python3 -B scripts/campaign-text/apply.py <series>/<slug> <patch.json>`. It refuses rules
   shorthand, internal keys and rules words in player text; it warns when a person's name, a
   «title» or a number of the old text is gone, or a text is below the minimum. Fix the text, or
   pass `--force` only when the warning is intended (a rules-card handout, a deliberate rewording).
3. Keep the story exactly: who knows what, what each clue proves, the numbers, DCs, choices,
   consequences, encounter names, handout titles. Rewrite the wording, add sensory detail, history,
   local customs, rumours and NPC speech that fit `truth` without revealing it early. New colour
   (a neighbour, a song, an old saying) is welcome; new keys, mechanics or plot facts are not.
4. Keep `check`, `choices`, `failForward` and `consequences` as they are unless they break §1–2.
5. Build and render the campaign (its series' `build.ts` and `render.ts` with the slug) — every
   variant must stay READY — and run `python3 -B scripts/campaign-text/audit.py <slug>`.

Reference rewrite: `dark-fantasy-2026/ash-tithe`, evening 1 (`sessions-1.json#[0]`).

Kept short or laid out on purpose (a form, a chart, a picture-card caption, a battle setup read as
rules): listed with the reason in `scripts/campaign-text/exceptions.json`, which the audit honours.

## 5. A read-aloud for every scene

Owner request 2026-11-23, second round: the DM always has something to read when a scene begins.
Every scene object has `readAloud`, placed before its `play`: what the heroes see, hear and smell
as the scene opens, who is there, one concrete fact or detail of the place, and an open moment
at the end (someone turns, speaks, something moves). §3 applies: present tense, «вы» only for
what the heroes perceive, no decision for them, no rules words, no secret before the story
reveals it.

- It fits every branch that can lead into the scene. A state that depends on earlier choices (who
  came along, whether a fight happened, what was paid) is left out or phrased so it holds either
  way; a scene whose place depends on the party's choice describes the person or the thing, not
  the room.
- Scene 1 follows the evening's `readAloud` directly: it continues from there and repeats none of
  its words (no five-word sequence in common; the tools refuse an echo).
- No eight-word sequence repeats between scene read-alouds of one campaign, and no two-word
  opening starts more than three of them.
- It is the book's first passage of the scene page (quoted, to be read aloud) and the HTML
  session page's read-aloud box. It never goes into a CampaignPackage: the largest variant is
  near the server's package limit, and the package's situation already carries the scene's play.

## 6. Reading an evening as the DM who runs it tonight

Read every evening as the DM who runs it tonight for a noisy table, and fix what fails:

1. The first minute of each scene: the DM can read or say something at once.
2. The three questions players ask there — «кто это?», «что здесь случилось?», «куда это
   ведёт?» — have answers in the text (the play, an NPC's `knows`, `public` or `voice`, a clue,
   a place). A missing answer becomes an NPC line or a short note for the DM.
3. Each scene says what changes if the heroes act and if they do not.
4. DM prose is warm, clear and imperative: «Отметьте, кто открыл дверь» rather than «Зафиксируйте
   принятую помощь и отказ, не оценивая их».
5. Names, times, places, who knows what and the terms of the campaign's own tracks agree across
   evenings.
6. Each ending leaves a hook for the next evening.
7. Every hero gets a spotlight.
8. Formulas vary inside a campaign. The audit refuses: «Спросите/Попросите каждого…» in more than
   a third of the endings; «пахнет» in more than 40% of the read-alouds, or more than two of them
   starting with «Пахнет»; one two-word opening for three or more endings.

The plot, keys, numbers, DCs, `check`, `choices`, `failForward`, `consequences`, `truth`, `secret`
and encounter blocks stay exactly. Added facts are colour only: no new clue, solution or mechanic.
The reader of a campaign is not the writer of its scene read-alouds.

## 7. The DM's pocket

Every campaign has `source/pocket.json`, the DM's material for improvising: what people say,
places off the main road and passers-by. The two built-in adventures keep theirs beside their pages
(`scripts/adventures/books/ravenford-pocket.json`, `hollowmere-pocket.json`). The book shows it to
the DM only; it is never in a package, a player export or the players' page.

| List      | Items | Each item                                                                                                                                    |
| --------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `rumours` |  8–12 | `text` — how a local tells it, in «…»; `truth` — `true`, `false` or `partial`; `note` — for the DM only: what is behind it or where it leads |
| `places`  |   5–6 | `name`; `text` — 35–80 words, read aloud or retold                                                                                           |
| `people`  |   5–6 | `name`, `look`, `line` — a typical phrase in «…», `knows` — one small thing they can tell                                                    |

- Consistent with `world.json` `truth` and the cast; at least one rumour of each kind.
- A false rumour is harmless: it leads to no dead end, and in a mystery it never names an
  innocent person of the cast as the culprit. A true one may point at what the story already
  holds; it never gives a new clue, solution or mechanic.
- Passers-by and places are new and minor: not a person of the cast, not a place of the world.
  No new keys; age band and boundaries of the campaign apply.

`python3 -B scripts/campaign-text/pocket.py <campaign> <draft.json>` checks a draft and writes it.

## 8. Originality across campaigns

No twelve-word sequence of narrative prose (read-alouds, play, endings, descriptions, handouts,
the pocket) is shared by two campaigns; the audit reports it as `cross-campaign-12-words`.

Reference for §5 and §7: `dark-fantasy-2026/ash-tithe`, the scenes of evening 1 and its
`source/pocket.json`.
