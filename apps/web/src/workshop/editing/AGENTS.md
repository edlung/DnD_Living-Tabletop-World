# Owner campaign editing

Read the parent workshop instructions and current Stage 430 work order.

- `model.ts` uses the public JSON Schema from campaign contracts. `field-controls.tsx`
  and `collections.tsx` expose all authored fields without making JSON the only editor.
  Existing identity fields stay hidden and immutable, including across union changes;
  only new authored objects receive fresh local keys.
- `scenario-tab.tsx` owns full package buffers. These components never persist them
  in browser storage or move them into the metadata-only editor root.
- `use-scenario-save.ts` and `use-action.ts` retain the exact nonce, payload and CAS
  context after an uncertain response. A same-owner conflict preserves user input;
  changed ownership drops the whole private subtree via WorkshopClient.
- `locks.tsx` changes immutable protection snapshots only through explicit choices.
  Keep existing orphan protections unless the owner explicitly unchecks them.
- `targets.ts` maps server catalog sections/stable keys, never display names or
  array indices. AI edit requests send catalog target IDs only.
- `ai-edit.tsx` freezes the reviewed scope before enqueue. `edit-jobs.tsx` reads
  EDIT metadata/progress; proposals append no revision until explicit review/adoption.
- `schemas.ts` validates owner response DTOs, including typed conflict envelopes.
  Any callback after unmount or owner/revision replacement must be ignored.
- Keep UI strings in `ru-workshop-editing.ts`, imported by main and dictionary tests.
  Verify new states at 1440/768/390/320 with layout measurements and axe.
