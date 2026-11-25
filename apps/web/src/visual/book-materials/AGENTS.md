# The books' materials (generated)

`manifest.json` and `book-materials.css` are written by `scripts/book-materials/build.ts` from the
Codex CLI originals (one folder a book) together with `apps/web/public/book-materials/`. Never edit
them by hand: draw or redraw the picture, then run the script (docs/adr/0075-book-interface.md §2).
A campaign's book shows only its own set; one without a set keeps its theme's material.

Pieces of a set (`PIECES` and `CUTS` in the script): the binding, the paper, the tray, the ribbon,
a divider, the emblem, the parts' and the moments' icons; and, since Stage 1210 for three campaigns
on trial (`lighthouse`, `rain-check`, `marrow-crown`; ADR 0075 §22), the working spread's seals
(`seal-roll`, `seal-fight`, `seal-rest`, `seal-screen`, `seal-give`), the plate of a chapter's
initial (`initial`), a corner ornament (`corner`, cut from its original's top-left corner) and the
edge of the block of pages (`edge`, a band cut from the painted fore-edge). The script removes the
published folder and rebuilds every book: run it on the whole originals folder
(`~/Documents/living-tabletop-world-art/book-sets-2026-11-23/final`), and expect only the files of
the pieces you added to change (`git status`).
