source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s)
mr=$(jq -r '.requests[]|select(.entityId=="mira-vale" and .variant=="reference")|.requestId' $WORK/lineage.json)
wt=$(jq -r '.requests[]|select(.entityId=="wagon-tracks")|.requestId' $WORK/lineage.json)
gob=$(jq -r '.assets[]|select(.entityId=="goblin-shaman" and .variant=="reference")|.contentHash' $WORK/lineage.json)
echo "approve SUPERSEDED curated mira ref:"; c dm s1-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$mr~asset\"}"
echo "approve RETRACTED wagon-tracks:"; c dm s2-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$wt~asset\"}"
echo "DM forges StartAssetJob/CompleteAssetJob:"
c dm f0-$S '{"type":"RequestAsset","entityId":"orin-stonebeard","variant":"derived","label":"night","audience":"players"}'
rq="http:dm-ravenford:f0-$S#0"
c dm f1-$S "{\"type\":\"StartAssetJob\",\"requestId\":\"$rq\"}"
c dm f2-$S "{\"type\":\"CompleteAssetJob\",\"requestId\":\"$rq\",\"contentHash\":\"$gob\",\"mediaType\":\"image/webp\",\"generator\":{\"provider\":\"curated\",\"model\":\"x\"}}"
c dm f3-$S "{\"type\":\"FailAssetJob\",\"requestId\":\"$rq\",\"reason\":\"REFUSED\"}"
echo "player forges approve/retract/cancel:"
c player p1-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$mr~asset\"}"
c player p2-$S "{\"type\":\"CancelAssetRequest\",\"requestId\":\"$rq\"}"
echo "purpose/kind mismatch: battle-map for a character, figure for a location, derived without label, label injection:"
c dm k1-$S '{"type":"RequestAsset","entityId":"mira-vale","variant":"derived","purpose":"battle-map","label":"map","audience":"players"}'
c dm k2-$S '{"type":"RequestAsset","entityId":"market-square","variant":"derived","purpose":"figure","label":"figure","audience":"players"}'
c dm k3-$S '{"type":"RequestAsset","entityId":"mira-vale","variant":"reference","purpose":"figure","audience":"players"}'
c dm k4-$S '{"type":"RequestAsset","entityId":"goblin-weapon","variant":"derived","label":"night","audience":"players"}'
c dm k5-$S '{"type":"RequestAsset","entityId":"mira-vale","variant":"reference","note":"   "}'
c dm k6-$S '{"type":"RequestAsset","entityId":"no-such-entity","variant":"reference"}'
