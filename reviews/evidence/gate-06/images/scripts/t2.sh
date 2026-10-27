source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
S=$(date +%s)
stream_open pf player "CHARACTER:elowen-starwhisper&focus=captain-thorne&place=market-square" -H "Sec-Fetch-Site: same-origin" -H "Origin: $ORIGIN"
stream_open pp player "CHARACTER:elowen-starwhisper" -H "Sec-Fetch-Site: same-origin" -H "Origin: $ORIGIN"
stream_open pg player "CHARACTER:elowen-starwhisper&focus=goblin-shaman" -H "Sec-Fetch-Site: same-origin" -H "Origin: $ORIGIN"
sleep 3
n() { printf 'changed: focusThorne=%s plain=%s focusGoblin=%s' $(grep -c 'event: changed' $WORK/pf.raw) $(grep -c 'event: changed' $WORK/pp.raw) $(grep -c 'event: changed' $WORK/pg.raw); echo; }
waitasset() { for i in $(seq 30); do get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; a=$(jq -r ".assets[]|select(.requestId|endswith(\":$1#0\"))|[.assetId,.contentHash,.status]|@tsv" $WORK/response.body); [ -n "$a" ] && { echo "$a"; return; }; sleep 1; done; }
echo "ready: $(grep -c ready $WORK/pf.raw) $(grep -c ready $WORK/pp.raw) $(grep -c ready $WORK/pg.raw)"; n
echo "== A. hidden entity (goblin-shaman), DM-only candidate + approve"
c dm ga-$S '{"type":"RequestAsset","entityId":"goblin-shaman","variant":"derived","label":"dead","audience":"dm"}'
a=$(waitasset ga-$S); sleep 6; n
c dm gaA-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$(echo "$a"|cut -f1)\"}"; sleep 6; n
echo "== B. known-unobserved captain-thorne: players derived 'dead' candidate"
c dm td-$S '{"type":"RequestAsset","entityId":"captain-thorne","variant":"derived","label":"dead","audience":"players"}'
a=$(waitasset td-$S); echo "$a" | cut -f2,3; sleep 6; n
echo "player thorne before approve: pres=$(pv captain-thorne) assets=$(pa captain-thorne)"
c dm tdA-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$(echo "$a"|cut -f1)\"}"; sleep 6; n
h=$(echo "$a"|cut -f2); echo "$h" > $WORK/t2.dead
echo "player thorne after approve: pres=$(pv captain-thorne) assets=$(pa captain-thorne) content=$(ct $h)"
cp $WORK/response.body $EV/t2-thorne-dead-as-player.svg
get player "/campaigns/$CAMPAIGN/entities/captain-thorne/presentation?$EL" >/dev/null; jq -c '.presentation|{observed,status,tags}' $WORK/response.body
echo "== C. market-square: DM-only 'night' supersedes players' night"
sqn=$(jq -r '.assets[]|select(.entityId=="market-square" and .label=="night")|.contentHash' $WORK/lineage.json)
echo "player market assets before: $(pa market-square) night-content=$(ct $sqn)"
c dm mn-$S '{"type":"RequestAsset","entityId":"market-square","variant":"derived","label":"night","audience":"dm"}'
a=$(waitasset mn-$S); sleep 6; n
c dm mnA-$S "{\"type\":\"ApproveAsset\",\"assetId\":\"$(echo "$a"|cut -f1)\"}"; sleep 6; n
echo "player market after DM-only approve: $(pa market-square) old-night=$(ct $sqn) old-night-at=$(ct $sqn "$EL&at=36000") dmonly=$(ct $(echo "$a"|cut -f2))"
lin market-square
pkill -f "campaigns/ravenford/live" 2>/dev/null; exit 0
