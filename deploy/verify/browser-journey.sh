#!/usr/bin/env bash
# browser-journey.sh: the Russian browser journeys against this local deployment
# (TLS_MODE=internal): Playwright's Chromium through Caddy over HTTPS (playwright.deploy.config.ts,
# tests/deploy/). The operator issues the DM's link in the server container; the DM joins on the
# join page and invites a player from the Players sheet; the player joins, sees the market square
# with its curated picture and figures, and acts once; the DM revokes the player, whose screen
# says "Вы вышли" through the live stream; the DM signs out (docs/adr/0037-deployment.md, "Full
# product"). Spends two of this host's redeems.
# Chromium trusts Caddy's local CA for this run only: openssl first verifies the intermediate
# against the root and the served chain against the root, then Chromium accepts exactly the chains
# that carry that intermediate's key (--ignore-certificate-errors-spki-list); PUBLIC_HOST resolves
# to 127.0.0.1. Nothing is installed in a system or browser trust store.
# Needs the repository's dependencies and Playwright's Chromium (pnpm install --frozen-lockfile;
# pnpm exec playwright install chromium). Tokens never reach the output; Playwright keeps no trace,
# screenshot or video, and its output directory is removed afterwards.
source "$(dirname "$0")/../scripts/lib.sh"
require_env_file
[ "$(env_value TLS_MODE)" = internal ] || die 'local verification only: needs TLS_MODE=internal'
[ -x "$REPO_DIR/node_modules/.bin/playwright" ] ||
  die 'Playwright is not installed: pnpm install --frozen-lockfile && pnpm exec playwright install chromium'

host=$(env_value PUBLIC_HOST)
port=$(published_port PROXY_HTTPS_PUBLISH 443)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pki=/data/caddy/pki/authorities/local
compose exec -T proxy cat "$pki/root.crt" >"$work/root.crt"
compose exec -T proxy cat "$pki/intermediate.crt" >"$work/intermediate.crt"
openssl verify -CAfile "$work/root.crt" "$work/intermediate.crt" ||
  die "Caddy's intermediate does not verify against its root"
served=$(openssl s_client -connect "127.0.0.1:$port" -servername "$host" -CAfile "$work/root.crt" \
  -verify_return_error </dev/null 2>/dev/null) || die 'the served chain does not verify against the local root'
grep -q 'Verify return code: 0 (ok)' <<<"$served" || die 'the served chain does not verify'
spki=$(openssl x509 -in "$work/intermediate.crt" -pubkey -noout | openssl pkey -pubin -outform der |
  openssl dgst -sha256 -binary | openssl base64 -A)
say "Chromium trusts Caddy's local CA for this run: its intermediate, SPKI sha256/$spki"
openssl x509 -in "$work/intermediate.crt" -noout -subject -issuer -enddate | sed 's/^/     /'

say "the browser journeys against $(env_value PUBLIC_ORIGIN)"
(
  cd "$REPO_DIR"
  LTW_DEPLOY_ORIGIN=$(env_value PUBLIC_ORIGIN) LTW_DEPLOY_HOST=$host LTW_DEPLOY_SPKI=$spki \
    LTW_DEPLOY_DIR=$DEPLOY_DIR LTW_DEPLOY_OUTPUT=$work/results \
    "$REPO_DIR/node_modules/.bin/playwright" test -c playwright.deploy.config.ts
)
say 'browser journeys passed'
