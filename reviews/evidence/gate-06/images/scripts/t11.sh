source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
sq=$(jq -r '.assets[]|select(.entityId=="market-square" and .variant=="reference")|.contentHash' $WORK/lineage.json)
gob=$(jq -r '.assets[]|select(.entityId=="goblin-shaman" and .variant=="reference")|.contentHash' $WORK/lineage.json)
echo "DM preview as Elowen: goblin content=$(ct $gob "$EL" dm) market=$(ct $sq "$EL" dm) goblin-assets=$(get dm "/campaigns/$CAMPAIGN/entities/goblin-shaman/assets?$EL")"
echo "DM as DM: goblin content=$(ct $gob "$DMP" dm)"
cp $WORK/player.jar $WORK/player-old.jar
stream_open rv player "CHARACTER:elowen-starwhisper" -H "Sec-Fetch-Site: same-origin" -H "Origin: $ORIGIN"; sleep 2
echo "player before revoke: $(ct $sq)"
echo "revoke: $(post dm "/campaigns/$CAMPAIGN/members/elowen-starwhisper/revoke" '{}')"
sleep 2; echo "stream: $(grep -E 'event: closed' -A1 $WORK/rv.raw | tr '\n' ' ')"
cp $WORK/player-old.jar $WORK/player.jar
echo "revoked player content=$(ct $sq) assets=$(get player "/campaigns/$CAMPAIGN/entities/market-square/assets?$EL") pres=$(get player "/campaigns/$CAMPAIGN/entities/market-square/presentation?$EL")"
pkill -f "campaigns/ravenford/live" 2>/dev/null; exit 0
