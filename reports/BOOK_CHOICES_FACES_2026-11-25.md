# The remaining choices drawn — report (2026-11-25)

Work order `work-orders/BOOK_CHOICES_FACES_2026-11-25.md`; ADR 0075 §29; the owner's words
`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`. Branch `claude/book-choices-faces`, stacked on
`claude/book-forms-drawn` (pull request 110). Status: **implemented; nothing is merged or
deployed.**

## What changed on the screen

| Where                            | Before                                                          | Now                                                                         |
| -------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Players: an invitation           | «Персонаж» — a list of names; «Ссылка истекает через» — a list  | The heroes' faces; «1 день · 3 дня · 7 дней» as stamped words               |
| Players: a player's card         | «Ещё один персонаж этому игроку» — «Выберите персонажа» ▾       | The free heroes' faces, then «Дать игроку …»                                |
| Players: the table's link        | «Открыть на» — a list of hours                                  | «2 ч · 4 ч · 8 ч · 24 ч» as stamped words                                   |
| Session: the table's sound       | A list of seven                                                 | Seven vignettes: by the scene, rain, wind, fire, a crowd, night, silence    |
| Add to the world                 | «Что создать», «Какое это место» — lists                        | Seven and seven vignettes                                                   |
| Chat                             | «Кому», «Как» — two lists                                       | «Все за столом» and the heroes' faces; narration and out of character drawn |
| Dice: who sees a roll            | A list                                                          | Everyone, only me, then each hero's face «… и я»                            |
| Settings: the campaign's options | Three lists                                                     | Vignettes: a new level's hit points (three), levels (two), carrying (two)   |
| Encounter: a creature's side     | A list                                                          | Party, hostile, neutral drawn                                               |
| Time and weather: the road       | «Опасность» — a list                                            | Cold and heat drawn                                                         |
| The DM's appendix                | A trap's tier, a stress's save, who catches a contagion — lists | Stamped words, stamped words, faces                                         |
| Text size (Dice, How to play)    | A list                                                          | «Обычный · Крупнее · Самый крупный», each word at its own size              |

## Pictures by Codex CLI

Thirty-four vignettes more, in the set's engraved style (the same reference picture, the same
inks), into the product's set as `pick-*`: `sound-*` (six; rain is the weather's own picture),
`make-*` (seven), `place-*` (seven), `voice-*` (two), `side-*` (three), `hazard-*` (two),
`hp-level-*` (three), `levels-*` (two), `carrying-*` (two). Prompts and originals:
`~/Documents/living-tabletop-world-art/book-picks-2026-11-25/` (`pick-fifth.py`).

## New phrases of the interface

None: every group keeps its name and every option its words.

## Verification

- **Static**: format, lint, typecheck, the context budget.
- **Unit**: 5,139 of 5,139; the test of the product's set holds a picture for every new choice
  (`tests/ui-kit/book-materials.test.ts`).
- **Journeys** (Chromium and the iPad project): the forms that changed — editors, the toolbox,
  comforts, keepsakes, the place's and the table's sound, the agreement, rests, the campaign's
  options, several characters, chat, signing in, the builder, dice, the bestiary, encounters, the
  guide, accessibility, the sections' screens, pages by tasks, pairing a screen, online — 72 of
  85 at first: thirteen failed in one shared step, the helper that invites a player
  (`tests/e2e/support/sign-in.ts`), which still chose from the list. Moved to the faces with the
  five journeys that invite a second player; those fifteen pass.
- **Looked at, with the layout audit**: every page of the DM's book whole at 766 px, then the
  Players, Settings, Chat and Dice pages: clean. Two things were fixed from the pictures: a
  syllable's hyphen had cut names and «Показывается» to fill a line (it is kept for the one word
  longer than its tile, «преимуществом»), and the old rule of a player's card stretched the face
  of another character across the card.
- **Not verified**: a real phone and tablet; a screen reader reading the faces' groups.
