# Integrated campaign verification (Stage450)

- This is test support only, excluded from production builds. `fixture.ts` composes
  the real PostgreSQL stores, admitted preparation/accounting runtime, owner HTTP,
  ordinary invitation authentication and the activation worker in one throwaway DB.
- `transport.ts` replaces only fetch. It returns clearly scripted English Bell
  tool outputs from the existing specimen helper. It never calls a provider and
  never establishes live-model quality, actual provider usage or owner acceptance.
- Each transport invocation observes committed dispatch, lease/fence, preparation
  session and accounting attempt from a second PostgreSQL connection. Do not
  replace the admitted runtime, journal, grants or immutable storage with a stub.
- The test creates owners, sessions and drafts through normal private entry points;
  it does not seed a ready revision or manufacture campaign credentials/controllers.
- Ordinary game reads and commands use the publication-gated engine. Only the
  accepted activation worker receives raw access. No loops/services are started.
- Close workers, app, accounting tasks and pools before dropping the temporary DB.
  Keep source/tests near500lines and split independent concerns before700.
