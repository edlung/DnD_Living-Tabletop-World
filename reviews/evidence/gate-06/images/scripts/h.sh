# usage: source h.sh  (from anywhere)
R=/private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-images
EV=/private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-evidence/images
P=/private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work
source $R/deploy/scripts/lib.sh
source $R/deploy/verify/http.sh
cp "$WORK/ca.crt" "$P/ca.crt"; trap - EXIT; rm -rf "$WORK"; WORK=$P
set +e +u
umask 077
# cmd <jar> <commandId> <command-json>
cmd() { post "$1" "/campaigns/$CAMPAIGN/commands" "{\"commandId\":\"$2\",\"command\":$3}"; }
EL='perspective=CHARACTER:elowen-starwhisper'
DMP='perspective=DM'
# c <jar> <id> <json>: runs a command, prints "status code/status events"
c() { local s; s=$(cmd "$1" "$2" "$3"); printf '%s %s\n' "$s" "$(jq -c '[.status,.code,.error.code,.reason,[.events[]?.type]]' $WORK/response.body 2>/dev/null)"; }
lin() { get dm "/campaigns/$CAMPAIGN/assets" >/dev/null; jq -r --arg e "$1" '.assets[]|select(.entityId==$e)|[.variant,.purpose,.label,.audience,.status,.contentHash[7:19]]|@tsv' $WORK/response.body | tr '\n' ';'; echo; }
pv() { get ${3:-player} "/campaigns/$CAMPAIGN/entities/$1/presentation?${2:-$EL}" >/dev/null; jq -c '[.presentation.image.contentHash[7:19], .presentation.figure.contentHash[7:19], .presentation.battleMap.contentHash[7:19]]' $WORK/response.body; }
pa() { get ${3:-player} "/campaigns/$CAMPAIGN/entities/$1/assets?${2:-$EL}" >/dev/null; jq -c '[.assets[]|[.variant,.purpose,.version,.contentHash[7:19]]]' $WORK/response.body; }
ct() { get ${3:-player} "/campaigns/$CAMPAIGN/assets/content/${1/:/%3A}?${2:-$EL}"; }
