source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
gob=$(jq -r '.assets[]|select(.entityId=="goblin-shaman" and .variant=="reference")|.contentHash' $WORK/lineage.json)
sq=$(jq -r '.assets[]|select(.entityId=="market-square" and .variant=="reference")|.contentHash' $WORK/lineage.json)
for p in perspective=DM perspective=PARTY perspective=PUBLIC perspective=CHARACTER:mira-vale perspective=CHARACTER:goblin-shaman "perspective=CHARACTER:elowen-starwhisper&perspective=DM" "perspective=dm" ""; do
  a=$(get player "/campaigns/$CAMPAIGN/entities/goblin-shaman/assets?$p"); c=$(get player "/campaigns/$CAMPAIGN/assets/content/${gob/:/%3A}?$p"); b=$(jq -c .code $WORK/response.body 2>/dev/null)
  echo "player [$p] goblin assets=$a content=$c $b"
done
echo "player lineage: $(get player /campaigns/$CAMPAIGN/assets)"
echo "outsider lineage: $(get - /campaigns/$CAMPAIGN/assets) content-sq: $(get - "/campaigns/$CAMPAIGN/assets/content/${sq/:/%3A}?$EL")"
echo "player other campaign: $(get player "/campaigns/other/assets/content/${sq/:/%3A}?$EL") $(get player "/campaigns/ravenford-en/entities/market-square/assets?$EL")"
echo "player sq content: $(get player "/campaigns/$CAMPAIGN/assets/content/${sq/:/%3A}?$EL")"
echo "player sq content raw colon: $(get player "/campaigns/$CAMPAIGN/assets/content/$sq?$EL")"
echo "player gob content upper: $(get player "/campaigns/$CAMPAIGN/assets/content/$(echo ${gob/:/%3A} | tr a-f A-F)?$EL")"
