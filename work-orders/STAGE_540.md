# Work Order — Stage 540: A-to-Z verification, audits and release

Authority: owner request 2026-11-01, program `docs/PRODUCT_COMPLETION_PLAN.md`.

## Deliver

1. **The whole game in the browser**: the Missing Caravan played from the sign-in to the quest's
   ending as the DM and the player together (`tests/e2e/a-to-z.spec.ts`): Mira's account, the site
   examined, a theory, Orin and the symbol, the accounts against each other, the ambush fought with
   weapons, spells and dice, the return, the truth told to Mira (the Journal says Completed), a short
   rest with a Hit Point Die, a long rest, a level, the Chronicle.
2. **Gaps found on the way** fixed in place (a defect is fixed, not listed), with a test where one
   fits.
3. **Audits**: the layout audit at 1440, 768, 390 and 320 px, dark and light, on every screen the
   journey passes (the deferred perspective select at 320 px included); axe; a UX pass by user task.
4. **Release**: the full suite and CI green on the program's pull request; the owner is asked once to
   merge and deploy; on approval the VPS gets a backup, the review campaign's reset (fixtures
   changed, `deploy/RUNBOOK.md` §12), the new release and a new DM link, delivered privately.

## Boundaries

Product scope stays the program's (decision 11). No credential, provider or domain changes; no
v0.1 tag without the owner.
