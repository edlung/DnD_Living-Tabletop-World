# Protected revisions (Stage430)

- All operations are owner/draft qualified. Lock snapshots and write receipts are
  immutable private authoring metadata, never live-world events.
- Draft lock precedes nonce replay, CAS, identity allocation and manifest writes.
  Exact accepted requests replay before current policy guards. Changed intent fails.
- Legacy revision fingerprints stay unchanged. New policy receipts bind locks and
  reviewed adoption/restore intent atomically with the revision.
- Locks preserve exact server-resolved content or selected image projections. Image
  guards evaluate prospective inherited state and derived reference dependencies.
- Adoption uses the current owner session and stored candidate provenance, not the
  original worker lease or HTTP assertions. Restore appends a new immutable revision.
- Test-only memory storage lives under testing/. Migration0021 requires an aware
  application/operator on recovery; older workers must not consume EDIT jobs.
