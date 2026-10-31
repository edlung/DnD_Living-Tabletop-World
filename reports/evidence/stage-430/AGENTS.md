# Stage430 verification evidence

Start with `index.md`; open only the referenced log or individual screenshot.
Keep generated layout measurements and image bytes unchanged after the checkpoint
is frozen. `package.sha256` binds the delivered source and verification receipts;
the handoff carries its digest separately.

All provider transport in these tests is injected/scripted. The real PostgreSQL
authorization, dispatch gate, accounting, worker and revision controls still run.
These receipts do not establish live provider quality, paid cost or latency, or
human play acceptance. No default database or real credential was changed.
