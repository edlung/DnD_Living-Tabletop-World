source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s); aid=$(cat $WORK/t1.aid); h=$(cat $WORK/t1.hash)
old=$(jq -r '.assets[]|select(.entityId=="mira-vale" and .variant=="reference" and .generator.provider=="curated")|.contentHash' $WORK/lineage.json)
echo "undo approve:"; c dm undo-$S '{"type":"UndoCommand","targetCommandId":"http:dm-ravenford:apx-1793111306"}'
echo "after undo: pres=$(pv mira-vale) assets=$(pa mira-vale) cand=$(ct $h) old=$(ct $old)"; lin mira-vale
echo "re-approve:"; c dm appr2-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$aid\"}"
echo "after: pres=$(pv mira-vale) cand=$(ct $h) old=$(ct $old)"
echo "retract:"; c dm retr-$S "{\"type\":\"RetractAsset\",\"assetId\":\"$aid\"}"
echo "after retract: pres=$(pv mira-vale) assets=$(pa mira-vale) cand=$(ct $h) old=$(ct $old) cand-at0=$(ct $h "$EL&at=36000")"; lin mira-vale
echo "undo retract:"; c dm undoR-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"http:dm-ravenford:retr-$S\"}"
echo "undo re-approve (beneath retraction):"; c dm undoA2-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"http:dm-ravenford:appr2-$S\"}"
echo "final: pres=$(pv mira-vale) old=$(ct $old)"; lin mira-vale
