# Generation browser (Stage410)

This owner-only UI consumes Stage400 durable jobs through the workshop client.
No provider, fixture, campaign credentials or live-world commands belong here.

- `use-generation.ts` reads availability/history and lightweight progress only.
  Polling is bounded, nonoverlapping and stopped outside a visible running task.
- `form.tsx` restores the original stored brief before the first step, then keeps
  user input across refreshes. Uncertain enqueue retries retain the exact nonce,
  base revision and brief; a new request is an explicit choice.
- `job.tsx` owns cancel/retry receipts. Retry selects the returned child job,
  never the failed parent, and is offered only for FAILED jobs. CANCELLED starts
  a fresh request through the form; DISPATCH_UNKNOWN never automatically retries.
- A completed step has an explicit inspection button; its full package is read
  only after opening Scenario. Terminal jobs never say a step still waits for AI.
- `tab.tsx` owns job selection/history pages. A package/candidate opens through
  the parent's Scenario boundary; do not preload full job views here.
- `words.ts` translates fixed states/stages. Do not display raw IDs, exception
  bodies or unsupported claims about eventual AI output.
