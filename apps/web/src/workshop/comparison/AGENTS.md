# Campaign comparison and explicit review

Read the parent workshop instructions and current Stage 430 work order.

- `model.ts` compares all authored fields. Match keyed collection members by stable
  identity and keep their old path for before-side labels/references after reordering.
  A missing field differs from an explicitly recorded null.
- `changes.tsx` renders complete structured before/after values with bounded paging;
  do not replace this with a summary or a raw JSON-only inspector.
- `review.tsx` loads full owner review content only while mounted under Scenario.
  Show frozen AI instructions/scope, preparation findings, protection conflicts and
  picture consequences before an explicit adopt/restore action.
- Restoration creates a new revision. Never mutate or replace history.
- Adopt/restore retain exact nonce and review/CAS digests after a lost response;
  ignore all late callbacks after unmount. Replies use the shared revision view.
- UI must not imply that a proposal, planned encounter or review is runtime truth.
