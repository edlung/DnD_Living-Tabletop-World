source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
jar=${1:-player}; ch=${2:-elowen-starwhisper}
post dm "/campaigns/$CAMPAIGN/invitations" "{\"characterId\":\"$ch\",\"expiresHours\":1}"; echo
pt=$(token_of "$(jq -r .link $WORK/response.body)"); rm -f $WORK/$jar.jar; echo $jar redeem $(redeem $jar "$pt") ; unset pt
get $jar "/auth/session"; echo; body; echo
