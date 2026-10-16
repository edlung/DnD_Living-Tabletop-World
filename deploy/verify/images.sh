#!/usr/bin/env bash
# images.sh: the review campaign's pictures through the proxy (docs/adr/0035-images.md;
# docs/adr/0037-deployment.md, "Full product"). LOCAL VERIFICATION (TLS_MODE=internal) of a stack
# whose review campaign is seeded (deploy/scripts/review-campaign.sh):
#   1. no image provider: the server runs the placeholder generator, no image ceiling is stored
#      and the ledger is empty (deploy/scripts/spend.sh); what the in-play generator loads at start
#      (sharp, the style references) works in the server image, offline, without enabling it;
#   2. the curated set is in the campaign, every picture approved for players by the DM and made
#      by the `curated` generator (the DM's lineage through the proxy);
#   3. a player the DM invited reads, through Caddy, every approved picture of what Elowen knows
#      or perceives: 200, image/webp, nosniff, no-store (authorized bytes: never kept by a browser
#      or a shared cache, ADR 0022 §6), the server's sandbox policy, uncompressed, bytes whose
#      SHA-256 is the hash; every other curated picture is a 404;
#   4. the page's policy lets the client show them (img-src 'self' blob:, the object URLs);
#   5. an unapproved picture: the DM requests one and the server's worker makes it with the
#      placeholder; the player gets the 404 of a hash nobody stored, the DM the bytes under the
#      sandbox policy; the DM discards it; the ledger is still empty;
#   6. the player is revoked, the DM signs out; no credential in any log.
# Spends two of this host's redeems. Rerunnable. Tokens and cookies are never printed.
# Prints one line per check; exit status 1 if any failed.
source "$(dirname "$0")/../scripts/lib.sh"
source "$(dirname "$0")/http.sh"

ELOWEN=elowen-starwhisper
AS_ELOWEN="perspective=CHARACTER:$ELOWEN"
CONTENT_CSP="default-src 'none'; style-src 'unsafe-inline'; sandbox"
MANIFEST="$REPO_DIR/fixtures/ravenford-ru/assets/manifest.json"
STAMP=$(date +%s)
failures=0
umask 077
: >"$WORK/secrets"

check() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then
    printf 'PASS  %s\n' "$label"
  else
    printf 'FAIL  %s\n' "$label"
    failures=$((failures + 1))
  fi
}
is() { [ "$1" = "$2" ]; }
field() { jq -r "$1" "$WORK/response.body" 2>/dev/null || true; }
keep() { [ -z "$1" ] || printf '%s\n' "$1" >>"$WORK/secrets"; }
logs_clean() { [ "$(wc -l <"$WORK/secrets")" -ge 4 ] && ! grep -qFf "$WORK/secrets" "$WORK/logs.txt"; }
sha_of() { openssl dgst -sha256 -r "$1" | cut -c1-64; }
# The curated file of a content hash, or nothing.
file_of() { jq -r --arg h "${1#sha256:}" '.assets[] | select(.sha256 == $h) | .file' "$MANIFEST"; }
# The headers of an authorized picture, as the server sends them and the proxy keeps them.
served() {
  [ "$1" = 200 ] && [ "$(header content-type)" = "$2" ] &&
    [ "$(header x-content-type-options)" = nosniff ] && [ "$(header cache-control)" = no-store ] &&
    [ "$(header content-security-policy)" = "$CONTENT_CSP" ] &&
    [ -z "$(header content-encoding)" ] && header vary | grep -qi cookie
}
# content <jar> <hash> [perspective]: the bytes of a picture, as that browser in that
# perspective (Elowen's by default); prints the status.
content() { get "$1" "/campaigns/$CAMPAIGN/assets/content/${2/:/%3A}?${3:-$AS_ELOWEN}"; }
# The ledger's counters, as deploy/scripts/spend.sh prints them.
spend_images() {
  "$DEPLOY_DIR/scripts/spend.sh" >"$WORK/spend.out" 2>&1 || return 1
  grep '^{"day":' "$WORK/spend.out" | jq -c .images
}
ledger_empty() {
  printf '%s' "$1" | jq -e '.ceilingMicros == null and .spentMicros == "0" and .heldMicros == "0"
    and .charges == 0 and .unsettledReservations == []' >/dev/null
}

say 'no image provider: the placeholder generator, no ceiling stored, nothing spent'
check 'the server runs LTW_IMAGE_GENERATOR=placeholder' is \
  "$(compose exec -T server printenv LTW_IMAGE_GENERATOR)" placeholder
compose logs --no-color --no-log-prefix server 2>/dev/null | grep '"msg":"image generator"' | tail -n 1 |
  jq -c '{msg, generator, model}' >"$WORK/generator.txt" || true
printf '     start: %s\n' "$(cat "$WORK/generator.txt")"
check "the server's start named the placeholder" grep -q '"generator":"placeholder"' "$WORK/generator.txt"
images=$(spend_images) || images=''
printf '     spend.sh images: %s\n' "$images"
check 'spend.sh: no image ceiling, nothing spent, held or reserved' ledger_empty "$images"
tag=$(env_value LTW_IMAGE_TAG)
offline=$(docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint node --workdir /app/apps/server \
  "ltw-server:$tag" --input-type=module -e "
const { loadCuratedSet } = await import('./dist/images/curated-set.js');
const { loadStyleReferences } = await import('./dist/images/style-references.js');
const sharp = (await import('sharp')).default;
const refs = await loadStyleReferences(await loadCuratedSet());
console.log('sharp ' + sharp.versions.sharp + ', libvips ' + sharp.versions.vips + '; style references (bytes): '
  + JSON.stringify(Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.map((b) => b.byteLength)]))));
" 2>&1) || offline="failed: $offline"
printf '     ltw-server:%s, no network: %s\n' "$tag" "$offline"
check 'the in-play generator can start in this image (sharp, style references; not enabled)' \
  grep -q '^sharp .*"person":\[[0-9]*,[0-9]*\]' <<<"$offline"

say 'the DM signs in (the operator link) and invites a player for Elowen; the player joins'
dm_token=$(token_of "$(dm_link 1)")
keep "$dm_token"
status=$(redeem dm "$dm_token")
[ "$status" = 200 ] || die "the DM invitation was refused ($status)"
keep "$(session_of dm)"
get dm "/campaigns/$CAMPAIGN/invitations" >/dev/null
if [ "$(field "[.members[] | select(.characterId == \"$ELOWEN\")] | length")" != 0 ]; then
  say 'a player holds Elowen from an earlier run: the DM revokes that access first'
  post dm "/campaigns/$CAMPAIGN/members/$ELOWEN/revoke" '{}' >/dev/null
fi
status=$(post dm "/campaigns/$CAMPAIGN/invitations" "{\"characterId\":\"$ELOWEN\",\"expiresHours\":1}")
[ "$status" = 201 ] || die "the invitation was refused ($status)"
player_token=$(token_of "$(field .link)")
keep "$player_token"
status=$(redeem player "$player_token")
[ "$status" = 200 ] || die "the player invitation was refused ($status)"
keep "$(session_of player)"
printf '     DM and player signed in (cookies; tokens never printed)\n'

say "the curated set in the campaign (the DM's lineage)"
get dm "/campaigns/$CAMPAIGN/assets" >/dev/null
cp "$WORK/response.body" "$WORK/lineage.json"
expected=$(jq '[.assets[].entityIds | length] | add' "$MANIFEST")
jq -r '.assets[] | select(.generator.provider == "curated") |
  select(.status == "APPROVED" or .status == "CANONICAL") | select(.audience == "players") |
  "\(.entityId) \(.contentHash)"' "$WORK/lineage.json" | sort -u >"$WORK/curated.txt"
jq -r '.assets[] | "sha256:\(.sha256)"' "$MANIFEST" | sort -u >"$WORK/manifest.txt"
printf '     %s curated pictures approved for players (manifest: %s for %s files)\n' \
  "$(wc -l <"$WORK/curated.txt" | tr -d ' ')" "$expected" "$(wc -l <"$WORK/manifest.txt" | tr -d ' ')"
check 'every curated picture is approved for players' is "$(wc -l <"$WORK/curated.txt" | tr -d ' ')" "$expected"
check "their bytes are the manifest's files" is "$(cut -d' ' -f2 "$WORK/curated.txt" | sort -u)" \
  "$(cat "$WORK/manifest.txt")"
check 'requested by the DM (none by authoring)' is "$(jq '[.requests[] |
  select(.requestId | startswith("ravenford.curated.")) | select(.source.kind != "dm")] | length' \
  "$WORK/lineage.json")" 0

say 'the player reads what Elowen knows or perceives, through Caddy'
: >"$WORK/visible.txt"
for entity in $(cut -d' ' -f1 "$WORK/curated.txt" | sort -u); do
  if [ "$(get player "/campaigns/$CAMPAIGN/entities/$entity/assets?$AS_ELOWEN")" = 200 ]; then
    jq -r '.assets[].contentHash' "$WORK/response.body" >>"$WORK/visible.txt"
  fi
done
sort -u -o "$WORK/visible.txt" "$WORK/visible.txt"
cut -d' ' -f2 "$WORK/curated.txt" | sort -u | comm -23 - "$WORK/visible.txt" >"$WORK/hidden.txt"
get player "/campaigns/$CAMPAIGN/entities/market-square/presentation?$AS_ELOWEN" >/dev/null
square=$(field .presentation.image.contentHash)
get player "/campaigns/$CAMPAIGN/entities/mira-vale/presentation?$AS_ELOWEN" >/dev/null
mira=$(field .presentation.figure.contentHash)
printf '     visible to Elowen: %s pictures; not: %s; the market square shows %s, Mira stands as %s\n' \
  "$(wc -l <"$WORK/visible.txt" | tr -d ' ')" "$(wc -l <"$WORK/hidden.txt" | tr -d ' ')" \
  "$(file_of "$square")" "$(file_of "$mira")"
check "the market square's picture is a curated one Elowen sees" grep -qx "$square" "$WORK/visible.txt"
check "Mira's figure is a curated one Elowen sees" grep -qx "$mira" "$WORK/visible.txt"
ok=0 bad=''
first=true
while read -r hash; do
  [ -n "$hash" ] || continue
  status=$(content player "$hash")
  if [ "$first" = true ]; then
    printf '     %s:\n' "$hash"
    sed 's/\r$//; s/^/       /' "$WORK/response.headers" | grep -viE '^ *(date|x-request-id):'
    first=false
  fi
  if served "$status" image/webp && [ "sha256:$(sha_of "$WORK/response.body")" = "$hash" ]; then
    ok=$((ok + 1))
  else
    bad="$bad $hash($status)"
  fi
done <"$WORK/visible.txt"
printf '     served as checked: %s of %s;%s\n' "$ok" "$(wc -l <"$WORK/visible.txt" | tr -d ' ')" \
  "${bad:- none other}"
check 'each: 200 image/webp, nosniff, no-store, sandbox policy, Vary Cookie, uncompressed, SHA-256 = hash' \
  test -z "$bad"
hidden_ok=0 hidden_bad=''
while read -r hash; do
  [ -n "$hash" ] || continue
  status=$(content player "$hash")
  if [ "$status" = 404 ]; then hidden_ok=$((hidden_ok + 1)); else hidden_bad="$hidden_bad $hash($status)"; fi
done <"$WORK/hidden.txt"
printf '     curated pictures of what Elowen neither knows nor perceives: %s of %s are 404;%s\n' \
  "$hidden_ok" "$(wc -l <"$WORK/hidden.txt" | tr -d ' ')" "${hidden_bad:- none other}"
check 'every other curated picture is a 404 for the player' test -z "$hidden_bad"

say "the page's policy lets the client show them (object URLs)"
https --output /dev/null --dump-header "$WORK/page.headers" "$ORIGIN/"
page_csp=$(grep -i '^content-security-policy:' "$WORK/page.headers" | cut -d: -f2- | sed 's/^ //; s/\r$//')
printf '     %s\n' "$page_csp"
check "the page's img-src allows 'self' and blob:" grep -q "img-src 'self' blob:" <<<"$page_csp"

say 'an unapproved picture: the DM requests one, the placeholder worker makes it'
command="images-check-$STAMP"
status=$(post dm "/campaigns/$CAMPAIGN/commands" "{\"commandId\":\"$command\",\"command\":{
  \"type\":\"RequestAsset\",\"entityId\":\"mira-vale\",\"variant\":\"reference\",\"audience\":\"players\"}}")
check 'RequestAsset accepted' is "$status $(field .status)" '200 accepted'
# The command route keeps a DM's command ID under the actor (`http:<actor>:<commandId>`); the
# request is its first (`#0`).
candidate=''
for _ in $(seq 60); do
  get dm "/campaigns/$CAMPAIGN/assets" >/dev/null
  candidate=$(field ".assets[] | select(.requestId | endswith(\":$command#0\")) |
    [.assetId, .contentHash, .status, .mediaType, .generator.provider, .generator.model] | join(\" \")")
  [ -z "$candidate" ] || break
  sleep 1
done
printf '     candidate: %s\n' "${candidate:-none within 60 s}"
read -r asset hash state media provider model <<<"$candidate"
check 'a candidate, not approved, by the local placeholder' is \
  "${state:-} ${provider:-} ${model:-}" 'CANDIDATE local placeholder-svg-1'
status=$(content player "${hash:-sha256:none}")
printf '     player: %s %s\n' "$status" "$(jq -c .error "$WORK/response.body" 2>/dev/null)"
candidate_error=$(field '.error | tojson')
check 'the player gets 404 for the unapproved hash' is "$status" 404
unknown="sha256:$(openssl rand -hex 32)"
status=$(content player "$unknown")
check '... the same as for a hash nobody stored' is "$status $(field '.error | tojson')" \
  "404 $candidate_error"
status=$(content dm "${hash:-sha256:none}" perspective=DM)
printf '     DM: %s %s, %s\n' "$status" "$(header content-type)" "$(header content-security-policy)"
check 'the DM reads it, under the sandbox policy' served "$status" "${media:-none}"
status=$(post dm "/campaigns/$CAMPAIGN/commands" "{\"commandId\":\"$command.discard\",
  \"command\":{\"type\":\"RetractAsset\",\"assetId\":\"${asset:-none}\"}}")
check 'the DM discards it' is "$status $(field .status)" '200 accepted'
images=$(spend_images) || images=''
printf '     spend.sh images: %s\n' "$images"
check 'the ledger is still empty (the placeholder spends nothing)' ledger_empty "$images"

say 'the DM revokes the player and signs out'
status=$(post dm "/campaigns/$CAMPAIGN/members/$ELOWEN/revoke" '{}')
check 'the player is revoked' is "$status" 200
check "the player's next picture request is 401" is "$(content player "$square")" 401
check 'the DM signs out (204)' is "$(post dm /auth/sign-out '{}')" 204
compose logs --no-color proxy server >"$WORK/logs.txt" 2>&1
check "none of the $(wc -l <"$WORK/secrets" | tr -d ' ') credentials in $(wc -l <"$WORK/logs.txt" | tr -d ' ') log lines" \
  logs_clean

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'image checks passed'
