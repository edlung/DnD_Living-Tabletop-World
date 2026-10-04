# Graphics acceptance and evidence

These checks evaluate design deliverables and their handoff. They add no Stage 90 condition and do not replace existing formal gates. A QA report uses OBSERVED_OK, ISSUE, NOT_APPLICABLE, or NOT_RUN, with file/view references and an explanation.

## Checks for every production handoff

| ID | Check | Required evidence |
|---|---|---|
| VIS01 | Identity stays consistent across sample/variant/crop. | Side-by-side reference and output with named distinguishing features. |
| VIS02 | Art has readable objects, silhouettes, and useful crop areas. | Actual-size view and crop/anchor notes. |
| VIS03 | Controls, icons, and numbers remain legible at the supported sizes. | Named viewport and text-scale screenshots, including small icons. |
| VIS04 | Focus, selection, pending, unavailable, and failure states are distinct. | State sheet; keyboard behavior is separately NOT_RUN unless exercised. |
| VIS05 | Meaning does not depend only on color. | Knowledge-type labels/shapes and action-state examples. |
| VIS06 | No baked labels/numerical UI, unwanted symbols, opaque cutout edges, or unintended identity changes. | Image inspection against appropriate backgrounds. |
| VIS07 | Player design contains no private truth, hidden HP, future events, private proposal, or secret metadata. | Separate Player/DM views and review of exported pixels and public-facing names/content. |
| VIS08 | Combat overlays agree with the declared illustrative geometry and preserve legal choices. | Target/AoE/ally-warning examples; real legality remains an integration check. |
| VIS09 | Missing image, pending generation, and failure have neutral usable fallbacks. | State layouts; no borrowed private portrait. |
| VIS10 | Each delivered resource has actual dimensions/format/hash, provenance, and its consumer. | Asset-register entry and existing export file. |
| VIS11 | Source editability and font rights are described honestly. | Source file/reference and permission record; flattened art is labeled as such. |
| VIS12 | Historical/Day 2 artwork follows the selected canonical scenario. | Comparison with scenario/state reference, scoped memory for flashback. |
| VIS13 | Layout has a route to full authorized detail and does not force a quest or mandatory chat surface. | Annotated Player/DM flow. |
| VIS14 | Handoff is limited to the selected job and can be consumed by Opus. | Files, exact baseline, unresolved mappings, QA record, and integration notes. |

For jobs without UI, mark VIS03–05/08/13 NOT_APPLICABLE with a specific reason rather than inventing UI evidence. Reference selection is not a substitute for image inspection.

## Application integration remains separate

Opus verifies these behaviors in the consuming numbered stage:
- perspective switching and cache isolation with actual projections;
- range, target legality, cover, ally AoE warning, and the domain reaction lifecycle;
- stale/duplicate submissions, actual authoring confirmation and safe/unsafe undo;
- canonical-to-asset mapping, generation jobs, historical selection, and continuity;
- loading/performance and keyboard behavior on the real application;
- the real session and release evidence in Stages 240/250.

Sol should identify the existing contracts needed for these checks without implementing or certifying them. Backend or formal-gate results must cite the actual report/revision; a mockup cannot supply them.

## Structural validation

Run from the isolated checkout:

```sh
python3 docs/graphics/tools/validate_pack.py
git diff --check
git status --short
```

The Python checker requires only the standard library. It checks required package files, local Markdown links, register IDs/statuses, safe export paths, and hashes/evidence on READY_FOR_HANDOFF rows. It does not parse image pixels, certify permissions, judge style, or prove the game works.

## Completion record

For a job to be ready for handoff:
1. Its exact outputs exist and relevant register entries are updated.
2. Required design checks have evidence, with outstanding issues stated.
3. The accepted style/reference decision is cited when the work depends on it.
4. The consumer, dimensions, crop/anchor, and unresolved canonical mapping are clear.
5. No production files or formal gate statuses have been altered.
6. A handoff names the next job and its required parent-stage authorization, without automatically starting it.

Where a required source or tool is missing, return a PARTIAL handoff describing completed work and the concrete remaining dependency. Do not silently substitute generated or invented evidence.
