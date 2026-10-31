# Stage 380 evidence

Start with `reports/STAGE_380_COMPLETION.md` and the Stage 380 handoff. This is
generated verification evidence, not a runtime import or application fixture.
Query validation summaries narrowly rather than loading full transcripts.

- `validation.txt` and `validation-runner.txt`: full offline validation and its
  isolated-database/provider configuration; no live provider call or real credential.
- `layout/`: invitation, drafts and sign-out at 1440/768/390/320 px, plus the
  measurable audit results. Screens show test-only contents after token removal.
- `package.sha256`: changed source/docs/evidence identity, excluding itself and
  the handoff to avoid recursive hashing. Verify from the repository root.
- Reports describe code verification, not automatic rollout into an existing DB.
