#!/bin/sh
# Server container start (docs/adr/0037-deployment.md): forward-only migrations, serialized by the
# migrator's advisory lock, then the server (compose runs it under `init`). LTW_ALLOW_NEWER_SCHEMA
# is the rollback step: true lets this image start on a database a newer image migrated
# (deploy/RUNBOOK.md, "Roll back"); every other value refuses such a database.
set -eu
cd /app
if [ "${LTW_ALLOW_NEWER_SCHEMA:-false}" = true ]; then
  node apps/server/dist/platform/db/migrate-cli.js --allow-newer-database
else
  node apps/server/dist/platform/db/migrate-cli.js
fi
exec node apps/server/dist/main.js
