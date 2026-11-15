# Campaign distinctness rework

Library-level plan so the 53 campaigns do not play like one another. Scope:
`work-orders/CAMPAIGN_DISTINCTNESS_REWORK_2026-11-09.md`. Read `MATRIX.md` first;
`matrix.json` is the machine-readable source, `build_matrix.py` regenerates both from
`matrix_a.py` / `matrix_bc.py` and checks for collisions. Read by key; do not load whole.
`previous-sources-2026-11-09.tar.gz` holds every campaign's `source/` before the rework:
the campaigns are untracked, so this archive is the only way back. Never delete it.
