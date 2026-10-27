source /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-work/h.sh
sq=$(jq -r '.assets[]|select(.entityId=="market-square" and .variant=="reference")|.contentHash' $WORK/lineage.json)
gob=$(jq -r '.assets[]|select(.entityId=="goblin-shaman" and .variant=="reference")|.contentHash' $WORK/lineage.json)
cand=$(cat $WORK/t1.hash)
nx=sha256:$(printf x | openssl dgst -sha256 -r | cut -c1-64)
echo "== approved, player:"; ct $sq; echo; sed 's/\r$//' $WORK/response.headers | grep -viE '^(date|x-request-id):'
for h in $gob $cand $nx; do echo "== 404 probe ${h:7:12}:"; ct $h; echo; sed 's/\r$//' $WORK/response.headers | grep -viE '^(date|x-request-id):' | sort | md5; body | sed -E 's/"requestId":"[^"]*"/"requestId":"<id>"/'; echo; done
echo "== HEAD approved:"; https -s -I --cookie $WORK/player.jar -H 'Sec-Fetch-Site: same-origin' "$ORIGIN/api/campaigns/$CAMPAIGN/assets/content/${sq/:/%3A}?$EL" | sed 's/\r$//' | grep -iE '^(HTTP|content-|cache|etag|last-mod|accept-ranges)'
echo "== Range:"; https -s -o /dev/null -w '%{http_code} %{size_download}\n' -H 'Range: bytes=0-9' --cookie $WORK/player.jar -H 'Sec-Fetch-Site: same-origin' "$ORIGIN/api/campaigns/$CAMPAIGN/assets/content/${sq/:/%3A}?$EL"
echo "== cross-site fetch of approved image (Sec-Fetch-Site: cross-site, no-cors img):"; https -s -o /dev/null -w '%{http_code}\n' -H 'Sec-Fetch-Site: cross-site' -H 'Sec-Fetch-Mode: no-cors' -H 'Sec-Fetch-Dest: image' --cookie $WORK/player.jar "$ORIGIN/api/campaigns/$CAMPAIGN/assets/content/${sq/:/%3A}?$EL"
echo "== cross-site navigate:"; https -s -o /dev/null -w '%{http_code}\n' -H 'Sec-Fetch-Site: cross-site' -H 'Sec-Fetch-Mode: navigate' -H 'Sec-Fetch-Dest: document' --cookie $WORK/player.jar "$ORIGIN/api/campaigns/$CAMPAIGN/assets/content/${sq/:/%3A}?$EL"
echo "== cookie attrs:"; awk '$6=="ltw_session"{print "httponly-prefix=" substr($1,1,10), "secure=" $4, "path=" $3}' $WORK/player.jar
echo "== page CSP:"; https -s -o /dev/null -D - "$ORIGIN/" | sed 's/\r$//' | grep -iE '^(content-security-policy|x-frame|referrer|permissions|strict|cross-origin)'
