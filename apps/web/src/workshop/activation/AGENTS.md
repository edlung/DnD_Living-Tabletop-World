# Confirmed campaign activation (Stage 440)

Read the parent workshop instructions and current Stage 440 work order/design.

- Review is owner-only metadata. Never fetch a full package into this boundary or
  keep any activation control mounted in the restricted character preview.
- `model.ts` binds consent to the exact server revision, plan, locks, visual policy,
  manifest and review digest. Warning acknowledgements use server finding IDs;
  errors or incomplete preparation cannot be acknowledged away.
- `review.tsx` resets acknowledgement state when the review/picture policy changes.
  Confirm only on the owner's explicit click. A historical revision must first
  be restored as a new revision. No activation action invokes a provider.
- `use-activation.ts` retains the original nonce/body through a lost answer. New
  review intent needs an explicit refresh after conflict. Parent navigation waits
  for an uncertain confirmation; all late callbacks are ignored after unmount.
- `status.tsx` displays the original durable confirmed revision. Retry resumes the
  same activation; publication never regresses to a late provisioning response.
- `enter.ts` issues a normal invitation only on a separate Enter campaign click.
  Validate same-origin `/join#token` and immediately navigate. No token in React
  state/props, storage, logs, screenshots or hidden credential links.
- The normal join page clears its fragment before rendering and preserves the
  deliberate game-session replacement flow. Workshop/game cookies stay separate.
- Keep text in `ru-workshop-activation.ts`, imported by main and dictionary tests.
  Inspect activation/retry/published/list states at 1440/768/390/320 with layout/axe.
