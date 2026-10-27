source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s); tag=${1:-nb}
waitjob() { for i in $(seq 40); do get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; a=$(jq -r ".requests[]|select(.requestId|endswith(\":$1#0\"))|[.status,.failure]|@tsv" $WORK/response.body); case "$a" in FAILED*|COMPLETED*) echo "$a"; return;; esac; sleep 1; done; echo "timeout $a"; }
echo "single request ($tag):"; c dm $tag-$S '{"type":"RequestAsset","entityId":"orin-stonebeard","variant":"derived","label":"rain","audience":"players"}'; waitjob $tag-$S
echo "8 concurrent RequestAsset ($tag):"
for i in 1 2 3 4 5 6 7 8; do ( cmd dm $tag-c$i-$S '{"type":"RequestAsset","entityId":"orin-stonebeard","variant":"derived","label":"rain","audience":"players"}' >/dev/null; echo "c$i $(cat $WORK/response.body | jq -c '[.status,.code,.error.code]')" ) & done; wait
