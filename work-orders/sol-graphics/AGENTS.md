# Sol graphics work order rules

Model: GPT-6.1 Sol / HIGH, as assigned in ../../EFFORT_MATRIX.md for this isolated supporting role.

1. Execute only the job explicitly selected by the owner. Creating the packet or approving a design does not authorize the next job.
2. GFX00 is documentation-only preparation. GFX10 onward requires the corresponding numbered stage to be authorized; the work does not replace Opus implementation.
3. Read ../../docs/graphics/README.md, the selected job, and only its named sources.
4. Use an isolated managed worktree containing the package. Inspect branch/status before writes; preserve unrelated changes.
5. Write only design/ravenford/ outputs named by the job. A package correction may be proposed; do not rewrite instructions to claim completion.
6. No apps/, packages/, production fixtures, migrations, root dependency/lockfile edits, ADR changes, formal report edits, branch merge, or production runtime access.
7. Image generation and edits use an available image tool and its applicable skill. UI geometry can use SVG/code-native assets. Do not fabricate an unavailable tool or provider result.
8. Use available context and previous owner decisions. Ask only for missing choices that materially affect dependent work; continue independent permitted work.
9. End with the job handoff and stop. Sol cannot grant a formal gate PASS or approve its own material product change.
