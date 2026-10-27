source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s)
# find the DM-only night approval command id from the lineage (request id ends with :mn-<S>#0)
get dm "/campaigns/$CAMPAIGN/assets" >/dev/null
mnreq=$(jq -r '.assets[]|select(.entityId=="market-square" and .label=="night" and .audience=="dm")|.requestId' $WORK/response.body); mnS=${mnreq##*mn-}; mnS=${mnS%#0}
echo "DM-only night request $mnreq (stamp $mnS)"
waitasset() { for i in $(seq 30); do get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; a=$(jq -r ".assets[]|select(.requestId|endswith(\":$1#0\"))|[.assetId,.contentHash,.status]|@tsv" $WORK/response.body); [ -n "$a" ] && { echo "$a"; return; }; sleep 1; done; }
c dm pn-$S '{"type":"RequestAsset","entityId":"market-square","variant":"derived","label":"night","audience":"players"}'
a=$(waitasset pn-$S); echo "new players night: $(echo "$a"|cut -f2|cut -c8-19)"
c dm pnA-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$(echo "$a"|cut -f1)\"}"; get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; echo "approval events/supersedes: $(jq -c '.assets[]|select(.entityId=="market-square" and .label=="night")|[.audience,.status,.contentHash[7:15]]' $WORK/response.body | tr '\n' ' ')"
echo "player market assets: $(pa market-square)"
echo "undo earlier DM-only approval beneath the later one:"; c dm u1-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"http:dm-ravenford:mnA-$mnS\"}"
echo "undo latest players approval:"; c dm u2-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"http:dm-ravenford:pnA-$S\"}"
echo "after: $(lin market-square)"; echo "player market assets: $(pa market-square)"
echo "now undo DM-only approval:"; c dm u3-$S "{\"type\":\"UndoCommand\",\"targetCommandId\":\"http:dm-ravenford:mnA-$mnS\"}"
echo "after: $(lin market-square)"; echo "player market assets: $(pa market-square)"
get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; cp $WORK/response.body $WORK/lineage-before-restart.json
