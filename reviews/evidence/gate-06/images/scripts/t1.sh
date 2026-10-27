# Candidate lifecycle: request -> candidate visible? -> approve -> undo -> retract
source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s)
stream_open ps player "CHARACTER:elowen-starwhisper&focus=mira-vale&place=market-square" -H "Sec-Fetch-Site: same-origin" -H "Origin: $ORIGIN"
stream_open ps2 player "CHARACTER:elowen-starwhisper" -H "Sec-Fetch-Site: same-origin" -H "Origin: $ORIGIN"
sleep 3; echo "stream ready: $(grep -c 'event: ready' $WORK/ps.raw) / $(grep -c 'event: ready' $WORK/ps2.raw)"
pv() { get player "/campaigns/$CAMPAIGN/entities/mira-vale/presentation?$EL" >/dev/null; jq -c '[.presentation.image.contentHash[7:19], .presentation.figure.contentHash[7:19]]' $WORK/response.body; }
pa() { get player "/campaigns/$CAMPAIGN/entities/mira-vale/assets?$EL" >/dev/null; jq -c '[.assets[]|[.variant,.purpose,.version,.contentHash[7:19],.mediaType]]' $WORK/response.body; }
echo "before: pres=$(pv) assets=$(pa)"
echo "player RequestAsset: $(cmd player p-req-$S '{"type":"RequestAsset","entityId":"mira-vale","variant":"reference"}') $(jq -c '{status,code}' $WORK/response.body)"
echo "DM RequestAsset: $(cmd dm req-$S '{"type":"RequestAsset","entityId":"mira-vale","variant":"reference","audience":"players","note":"DMSECRET-NOTE she is the smuggler"}') $(jq -c '{status,code}' $WORK/response.body)"
c1=$(grep -c 'event: changed' $WORK/ps.raw)
for i in $(seq 30); do get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; a=$(jq -r ".assets[]|select(.requestId|endswith(\":req-$S#0\"))|[.assetId,.contentHash,.status,.mediaType]|@tsv" $WORK/response.body); [ -n "$a" ] && break; sleep 1; done
echo "candidate: $(echo "$a" | cut -f3,4) hash=$(echo "$a"|cut -f2|cut -c8-19)"
aid=$(echo "$a"|cut -f1); h=$(echo "$a"|cut -f2); echo "$aid" > $WORK/t1.aid; echo "$h" > $WORK/t1.hash
sleep 3; echo "player stream changed after request+candidate: $(( $(grep -c 'event: changed' $WORK/ps.raw) - c1 )) (focus) total=$(grep -c 'event: changed' $WORK/ps.raw)"
echo "candidate: pres=$(pv) assets=$(pa) content=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL") contentPARTY=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?perspective=PARTY") dmcontent=$(get dm "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$DMP") ct=$(header content-type) csp=\"$(header content-security-policy)\" cc=$(header cache-control)"
get dm "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$DMP" >/dev/null; cp $WORK/response.body $EV/t1-candidate.svg
c2=$(grep -c 'event: changed' $WORK/ps.raw)
echo "approve: $(cmd dm appr-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$aid\"}") $(jq -c '{status,code}' $WORK/response.body)"
sleep 3; echo "player stream changed after approve: $(( $(grep -c 'event: changed' $WORK/ps.raw) - c2 ))"
echo "approved: pres=$(pv) assets=$(pa) content=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL")"
old=$(jq -r '.assets[]|select(.entityId=="mira-vale" and .variant=="reference" and .generator.provider=="curated")|.contentHash' $WORK/lineage.json)
echo "old curated reference now: content=$(get player "/campaigns/$CAMPAIGN/assets/content/${old/:/%3A}?$EL")"
get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; jq -r '.assets[]|select(.entityId=="mira-vale")|[.variant,.purpose,.status,.contentHash[7:19]]|@tsv' $WORK/response.body
echo "undo approve: $(cmd dm undo-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"http:$(jq -r '.requests[]|select(.requestId|endswith(":req-'$S'#0"))|.requestId' $WORK/response.body | sed -E 's/^http:([^:]+):.*/\1/'):appr-$S\"}") $(jq -c '{status,code}' $WORK/response.body)"
echo "after undo: pres=$(pv) assets=$(pa) cand-content=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL") old=$(get player "/campaigns/$CAMPAIGN/assets/content/${old/:/%3A}?$EL")"
echo "redo approve (new id): $(cmd dm appr2-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$aid\"}") $(jq -c '{status,code}' $WORK/response.body)"
echo "retract: $(cmd dm retr-$S "{\"type\":\"RetractAsset\",\"assetId\":\"$aid\"}") $(jq -c '{status,code}' $WORK/response.body)"
echo "after retract: pres=$(pv) assets=$(pa) cand-content=$(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL") old=$(get player "/campaigns/$CAMPAIGN/assets/content/${old/:/%3A}?$EL")"
echo "at-past content of retracted (at=clock): $(get player "/campaigns/$CAMPAIGN/assets/content/${h/:/%3A}?$EL&at=0")"
get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; jq -r '.assets[]|select(.entityId=="mira-vale")|[.variant,.purpose,.status,.contentHash[7:19]]|@tsv' $WORK/response.body
