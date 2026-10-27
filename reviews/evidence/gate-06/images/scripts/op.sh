cd /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-images/deploy
op() { docker compose exec -T server node apps/server/dist/ai/accounting/operator-cli.js "$@" </dev/null 2>&1; }
