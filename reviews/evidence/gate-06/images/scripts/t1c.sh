source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s); aid=$(cat $WORK/t1.aid); h=$(cat $WORK/t1.hash)
pv() { get player "/campaigns/$CAMPAIGN/entities/mira-vale/presentation?$EL" >/dev/null; jq -c '[.presentation.image.contentHash[7:19], .presentation.figure.contentHash[7:19]]' $WORK/response.body; }
pa() { get player "/campaigns/$CAMPAIGN/entities/mira-vale/assets?$EL" >/dev/null; jq -c '[.assets[]|[.variant,.purpose,.version,.contentHash[7:19],.mediaType]]' $WORK/response.body; }
lin() { get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; jq -r '.assets[]|select(.entityId=="mira-vale")|[.variant,.purpose,.status,.contentHash[7:19]]|@tsv' $WORK/response.body | tr '\n' ';'; echo; }
old=$(jq -r '.assets[]|select(.entityId=="mira-vale" and .variant=="reference" and .generator.provider=="curated")|.contentHash' $WORK/lineage.json)
echo "approved (apx): pres=$(pv) assets=$(pa) cand=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL") ct=$(header content-type) old=$(get player "/campaigns/$CAMPAIGN/assets/content/${old/:/%3A}?$EL")"
lin
apx=$(get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; echo)
target=$(ls -1 /dev/null >/dev/null; echo "http:dm-ravenford:apx-1793111306")
echo "undo approve: $(cmd dm undo-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"$target\"}")"; body | head -c 300; echo
echo "after undo: pres=$(pv) assets=$(pa) cand=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL") old=$(get player "/campaigns/$CAMPAIGN/assets/content/${old/:/%3A}?$EL")"
lin
echo "re-approve: $(cmd dm appr2-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$aid\"}")"; body | head -c 200; echo
echo "retract: $(cmd dm retr-$S "{\"type\":\"RetractAsset\",\"assetId\":\"$aid\"}")"; body | head -c 200; echo
echo "after retract: pres=$(pv) assets=$(pa) cand=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL") old=$(get player "/campaigns/$CAMPAIGN/assets/content/${old/:/%3A}?$EL")"
lin
get player "/campaigns/$CAMPAIGN/entities/mira-vale/presentation?$EL" >/dev/null; echo "worldTime=$(jq .worldTime $WORK/response.body)"
