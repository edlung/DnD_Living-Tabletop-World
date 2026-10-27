source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
out=$1
{ get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; jq -S . $WORK/response.body; for e in $(jq -r '.assets[].entityId' $WORK/lineage.json | sort -u); do echo "$e $(pa $e) $(pv $e)"; done; } > $out
