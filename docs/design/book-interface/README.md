# The whole interface as a book: the demo (Stage 1010, 2026-11-23)

The clickable demo of all five books for the owner's look and acceptance
(`work-orders/STAGE_1010.md`, `docs/BOOK_INTERFACE_PLAN.md`, ADR 0075 §1). It is a thing to look at,
not code to continue: Stages 1020–1140 build the books from the product's own parts, after the owner
has accepted the demo and its corrections.

- The page: the owner's private page, named in `reports/STAGE_1010_COMPLETION.md`.
- `book-interface-demo-2026-11-23.zip` — its sources as published, with the tools that built its
  data, its pictures and its screenshots. Data and pictures are not in the archive; `tools/` says
  how they are made from the repository and the art originals.
- `*.png` — states of the demo at 1440×900 and 390×844.

## What it shows

| Frame                      | Hash                       | What is in it                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shelf                  | `#shelf`                   | The bookplate to sign in; "My books" face out with their ribbons; the library's 53 campaigns spine out, each spine cut from its campaign's own cover and bound in its material and accent; "look inside" as a spread; the account                                                                                                                             |
| The DM's book              | `#dm`, `#lh`, `#rc`, `#mc` | Seven parts behind bookmarks (Story, Scene, Heroes, World, Journal, Table, Rules); the running head (where, when, the meeting); the dice at the foot of every page; slips for what waits; the story's text turning in screens; cards of people, clues, handouts, fights, the puzzle; asking a roll; the fight and the world map as fold-outs; three campaigns |
| The hero's book            | `#hero`                    | A phone: five bookmarks, one page a screen, the dice at the foot, the DM's roll arriving as a slip and answered, handouts given, the hero's sheet                                                                                                                                                                                                             |
| The open book on the table | `#table`                   | The closed cover with the table's code, a place's plate, the words read aloud, the world map, the fight with its figures; what the DM sends from his book                                                                                                                                                                                                     |
| The manuscript             | `#manuscript`              | The writer's desk; a draft (a library campaign taken into the workshop) opened as a book dressed as its campaign: title page, contents, a page edited in place with fields in the margin, a proposed page marked unread, a proofreader's mark accepted or refused, plates, revisions compared, binding                                                        |
| A–Z                        | `#az`                      | The 1,018 controls of today (`docs/BOOK_INTERFACE_MAP.md`) with the book › page each goes to, and whether that page is in the demo                                                                                                                                                                                                                            |

One state is shared by all frames: a roll the DM asks appears in the hero's book; the answer comes
back as a slip in the DM's; what the DM casts is what the table shows; a bound manuscript stands on
the shelf.

## Each book in its own style

The owner's words of 2026-11-23: «каждая книга имеет свой стиль, согласно арту содержимого …
картинки кампании и книги (страницы, переплет, иконки) должны выглядеть гармонично».

| Book                                 | Binding and paper                                 | Icons of the parts                                                                                                                                        | Ribbon, dice tray                                                | Moment icons, ornaments                        |
| ------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| The product (shelf, bookplate, desk) | night-blue leather cover, the product's parchment | engraved gold-leaf emblems                                                                                                                                | — , green felt in walnut                                         | the bookplate, proof marks, seal, quill        |
| `lighthouse` (family, gouache)       | indigo bookcloth, cream paper                     | logbook, amber lantern, three hats on a hook, cameo, sky chart, linen notebook, tea table, handbook with spectacles                                       | sea-teal silk with a copper tip; indigo felt, honey wood         | brass and linen objects; divider, emblem       |
| `rain-check` (noir)                  | wet black dossier card, bond paper                | case file, street lamp in rain, fedoras on a rack, ID wallet, tram map with a pin, reporter's notebook, café table with a telephone, law book with a clip | red string with an evidence tag; green baize                     | bakelite, steel, manila; divider, emblem, clip |
| `marrow-crown` (dark fantasy)        | cracked umber leather, yellowed paper             | codex with bone corners, tallow lamp, climbers' hoods on a bone peg, bone cameo, hide map, sinew-tied notebook, slab table with bone dice, tally sticks   | braided marrow-red sinew with a bone bead; oiled leather in bone | bone, salt, tallow; divider, emblem, clasp     |

Every set was drawn by Codex CLI with that campaign's own pictures as the style reference (the
product's set with its UI kit's book spread, desk and emblem). Nothing of one book's set is used
inside another's. The product's set dresses only the shelf, the way in and the desk.

## Pictures

48 made for this demo on 2026-11-23 with Codex CLI (`gen.py`, six streams, about 100 s a picture,
none failed): the product's 18 (shelf, desk, bookplate, cover, tray, tab, proof, seal, quill, nine
part emblems) and 10 for each of the three campaigns (eight part icons, a ribbon, a tray).
Originals, prompts and the script: `~/Documents/living-tabletop-world-art/book-interface-2026-11-23/`.
The demo also uses the campaigns' own pictures (covers, places, people, world and battle maps from
`campaigns/`), the table materials of `apps/web/public/table-materials/`, and materials made
earlier (`dm-book-2026-11-22/`, `lighthouse-table-skin-2026-11-21/`).

## Text

No model wrote text for the demo. Story pages, people, clues, handouts and places are the
campaigns' own (`fixtures/campaign-library/<id>/book.json` and the default package). The
"proposed page" of the manuscript shows chapter 3's own text in place of generated text and says
so. Labels and hints are the session's interface words.

## What is a demo's shortcut and must not be carried into the product

- The state is one object in the page; rolls, hit points, the fight's order and damage are the
  page's own arithmetic. In the product every change is a command judged by the World Engine.
- The player's book reads the same data as the DM's; the product sends a player only the player's
  projection (no DM text, no difficulty).
- Rendering is template strings into one root; the product keeps React and its components.
- Many buttons only say what they would do (a toast): the shop, acting for a hero, the level-up,
  the picture queue's approval, sound, voice, cheers, the next game, the Chronicle's writing.
- The table's code, the seats' states, the TV's name and the chat message are examples.
- The A–Z "in the demo" means the page a control goes to exists in the demo, not that the control
  itself is drawn there.
