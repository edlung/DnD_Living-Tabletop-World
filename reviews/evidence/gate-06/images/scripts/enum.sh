source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
jar=${1:-player}; persp=${2:-$EL}
for e in $(jq -r '.assets[].entityId' $WORK/lineage.json | sort -u); do
  s1=$(get $jar "/campaigns/$CAMPAIGN/entities/$e/assets?$persp"); n=$(jq '.assets|length' $WORK/response.body 2>/dev/null)
  s2=$(get $jar "/campaigns/$CAMPAIGN/entities/$e/presentation?$persp"); im=$(jq -c '[.presentation.image.contentHash!=null,.presentation.figure!=null,.presentation.battleMap!=null,.presentation.observed]' $WORK/response.body 2>/dev/null)
  printf '%s assets=%s(%s) pres=%s %s\n' $e $s1 "$n" $s2 "$im"
done
