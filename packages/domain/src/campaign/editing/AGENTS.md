# Protected campaign editing (Stage430)

- Pure owner authoring operations only: no I/O, random IDs, clocks or World Engine writes.
- Target IDs come from stable canonical identities/keys and catalog lookup, never names,
  display aliases or array indices. Duplicate keyed objects are ambiguous; section repair
  remains available. Returned projections are copies, not mutable canonical references.
- Dependency permission follows directed incoming structural references. Shared words or
  names do not prove a dependency. Locked dependent content stays read-only.
- Candidate validation preserves every outside-scope value and order and every lock.
  Full diff is structured and complete; never accept AI-provided scope or provenance.
