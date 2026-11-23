# Campaign text standard (D&D 5e, Russian)

Owner request 2026-11-23: every campaign's texts are adapted to D&D, follow good adventure-writing
practice so the DM reads and runs them easily and nothing gets in the players' way, and stories,
dialogue and narration are not short — players want good stories, facts and lore to get into the
world. Texts are written by the session model itself, not through an API. Checked by
`python3 -B scripts/campaign-text/audit.py`; mechanical terms are fixed by
`python3 -B scripts/campaign-text/fix_terms.py`.

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

`opening`, `readAloud`, `ending`, location `description`, clue `appearance`, handout `text`.

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
