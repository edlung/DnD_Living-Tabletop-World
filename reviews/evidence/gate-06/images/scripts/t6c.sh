source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/op.sh
op spend | grep '^{' | jq -c .images
docker compose logs --no-log-prefix server 2>/dev/null | grep '"image budget denied' | jq -r .denied | sort | uniq -c
docker compose logs --no-log-prefix server 2>/dev/null | grep -ciE 'not-a-real-key|bearer' 
