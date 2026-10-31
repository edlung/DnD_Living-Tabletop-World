# Workshop browser access and campaign drafts (Stages 380, 410–450)

Read the accepted Stage 370 contract, current work order and `apps/web/AGENTS.md`.

- `start.ts` captures and clears the invitation fragment before any request.
- `transport.ts` keeps credentials inside one-shot holders/request-local variables;
  React state/props receive no token. Never use browser storage for credentials/data.
- `app.tsx` owns entry/replacement/sign-out; campaign sign-in is independent.
- `deferred-private.tsx` loads the editor, its dictionaries and styles only after
  authentication. Suspense/error states contain no package. `app.tsx` keeps its
  synchronous pagehide boundary mounted during that import; reload rechecks access.
- `private.tsx`, `route.ts`, `use-workshop-session.ts` share the owner boundary
  across the shelf and exact draft routes, including history navigation.
- `drafts.tsx` owns private container metadata and paging. `editor.tsx` holds
  metadata/revision summaries only; only mounted `scenario-tab.tsx` loads a full
  owner package. Candidate and saved-step inspection is explicit and read-only;
  a partial step is unfinished preparation, never a fully checked revision.
- `client.ts` binds the mounted owner on every request. A409 re-probes identity:
  the same owner preserves a revision conflict/input/nonce; changed or revoked
  ownership releases the client and discards the entire private subtree.
- `response-schemas.ts` validates response DTOs. Generation progress excludes
  all step/candidate content; `generation/` polls it only while visible/running.
- `scenario/` owns the linked index, complete structured inspector and basic
  field corrections. `editing/` owns complete manual forms, content/image protections
  and targeted edit preparation; `comparison/` owns full diffs and explicit adoption
  or restoration. Full packages and manual buffers stay inside mounted Scenario.
  Never infer runtime facts or execute any scenario plan.
- `preview/` owns stored-revision scene/board views. Its character branch loads only
  projected DTOs; the owner editor/catalogue unmount before that branch is shown.
- `pictures/` is owner-only generation/selection with manifest CAS, exact purpose
  briefs and explicit candidate choice. It never mounts in character preview.
- `activation/` owns metadata-only review, explicit bound consent, durable status
  and same-operation recovery. `campaigns/` lists explicit published ownership
  links; entering issues a normal invitation on a separate deliberate click.
- Keep an uncertain write's exact payload/nonce reachable across object
  navigation; do not silently replay it as a different correction or generation.
- A changed/revoked owner drops all private content. New server reads remain scoped.
- Draft requests include the mounted `x-workshop-owner` identity, so a replaced
  cookie cannot move an old tab's draft input into the new owner's workshop.
- Access strings remain in `i18n/ru-access.ts`; editor/scenario strings belong in
  `ru-workshop-editor.ts` / `ru-workshop-scenario.ts`, loaded by the deferred private module and dictionary coverage.
- Use the existing UI art/tokens; inspect 1440/768/390/320 px and run layout/axe checks.
