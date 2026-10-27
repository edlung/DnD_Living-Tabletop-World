source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s)
gw=$(jq -r '.requests[]|select(.entityId=="goblin-weapon")|.requestId' $WORK/lineage.json); gwc=${gw%#0}
wt=$(jq -r '.requests[]|select(.entityId=="wagon-tracks")|.requestId' $WORK/lineage.json); wtc=${wt%#0}
echo "undo curated approval of goblin-weapon:"; c dm u1-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"$gwc.approve\"}"
echo "retract curated wagon-tracks:"; c dm r1-$S "{\"type\":\"RetractAsset\",\"assetId\":\"$wt~asset\"}"
lin goblin-weapon; lin wagon-tracks
