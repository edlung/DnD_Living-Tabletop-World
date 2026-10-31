# Draft image authoring (Stage420 / ADR0038)

- All data is owner/draft qualified, private authoring metadata. No canonical
  asset worker, campaign membership, World Engine event or fake campaign ID.
- HTTP accepts owner intent only. Input, identity, source signature, provider/model,
  request digest, charge ID and provenance come from trusted server composition.
- Source signatures conservatively include narrative description, identity, exact
  purpose appearance/style, template, geometry and reference hash. The provider
  receives only permitted appearance/style/note, never narrative or knowledge.
- The database clock and current durable workshop session guard every job lease.
  Charge IDs are fresh per claim/fence. A committed dispatch without a stored
  result becomes DISPATCH_UNKNOWN after lease loss; never automatically resend.
- Bytes and candidate commit together. A generated candidate never chooses itself.
  Billing settlement survives cancellation/revocation independently of attachment.
- Selection and package append lock the owned draft first. Nonce replay precedes
  CAS. Every new revision gets version0 in the shared append transaction, freezing
  compatible parent choices at that instant. Later parent choices cannot propagate.
- Missing historical manifests initialize EMPTY version0, with no parent lookup.
  Empty/stale/missing art never means text-only acceptance. Manifest and image
  history are immutable; only explicit owner selection creates another version.
- Character byte reads require current selected compatible manifest membership
  and ordinary projected visibility. A hash alone never authorizes content.
- Migration0019/0020 recovery requires an aware application. Do not claim rollback
  compatibility with older binaries. Memory implementations are testing-only.
