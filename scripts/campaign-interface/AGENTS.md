# Campaign interface reference

Run `python3 scripts/campaign-interface/build.py` from the checkout to rebuild the offline DM
reference. Read Russian source and all supported party variants. Keep entity artwork attached
to explicit IDs. The web client imports only the public theme catalogue and surface patterns.

Run `python3 -B scripts/campaign-interface/readiness.py` after rebuilding the runtime library. It checks every party edition, both native adventures and the subject bindings used on the real board.
