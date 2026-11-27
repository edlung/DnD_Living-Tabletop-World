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

## 9. What follows each choice (forks)

Owner request 2026-11-27, third round (`reviews/OWNER_CAMPAIGN_STORY_2026-11-27.json`): the DM
always knows what happens when the players choose. Every scene with `choices` has `forks`, one
text a choice, in the same order (`forks[i]` follows `choices[i]`). A fork is the DM's text,
40–110 words (refused under 30 or over 150):

- who answers and how — at least one real line in «…»;
- what changes at once (a door, a debt, a witness, a light, a mood), concrete;
- where it comes back: a later evening, a person who remembers, a price named before it is paid.

A fork never decides for the heroes, never names a roll the scene's `check` does not hold, and
keeps to what `play`, `consequences` and later evenings already say: it develops a branch the
scene allows, it does not invent a clue, a solution or a mechanic. A fork that leaves the
prepared road says how the story gets back to it.

## 10. A voice and ready lines for every person

Every NPC has `voice` (12–40 words, at most 200 characters: the package NPC's manner) and
`lines`: 5–8 `{when, say}` — the situation in a few words (`При первой встрече`, `Если давят`,
`О Вералe`, `Когда правда вышла наружу`) and what the person says in it, in «…», 8–75 words.
Lines are speech the DM can read as is: the person's own rhythm, a concrete fact, a joke or a
fear. A line says nothing the person does not know and gives no secret before its `reveal`; a line
for after the reveal names that situation in `when`.

## 11. An epilogue for every ending

Every ending of `world.endings` has `epilogue`: what the DM reads aloud when the table reaches
it, 130–240 words (refused under 100 or over 280). §3 applies: present or near past, what the
world looks like after, what became of the people the heroes touched, one last image; no rules
words, no decision for the heroes. It fits the ending's `requires` and keeps its `cost`.

## 12. Turns of the story

`world.json` has `twists`: 2–4 `{title, turn, seeds, reveal, after}` built from the campaign's
`truth`:

- `turn` — what the heroes are led to believe and what is so (10–80 words);
- `seeds` — at least two `{session, text}`: the small things the DM plants before the turn, each
  in an evening no later than the turn's (8–70 words);
- `reveal` — `{session, text}`: the evening it most likely comes out, how and in whose words, and
  what happens if the heroes guessed earlier (25–170 words);
- `after` — what changes after it, who reacts how (15–120 words).

A seed is colour that agrees with `truth`, never a new clue the mystery's routes depend on.

Checked by `python3 -B scripts/campaign-text/audit.py` (rules `fork-*`, `voice-*`, `lines-*`,
`epilogue-*`, `twists-*`); written by `python3 -B scripts/campaign-text/story.py <campaign>
<patch.json>`; read by the writer with `dump.py <campaign> --part story`. The book shows forks
under the page's choices, lines on the person's card, the chapter's turns and — on the first and
the last chapter — the endings with their epilogues; the HTML session pages show forks and the
evening's turns, the DM's book the lines, the turns and the epilogues. None of it is in a package
or a player's page.
