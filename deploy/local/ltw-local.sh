#!/usr/bin/env bash
# ltw-local.sh: the game on the DM's laptop (docs/adr/0061-local-mode.md; deploy/RUNBOOK.md
# section 15). The deployment's own stack under Docker, as the Compose project `ltw-local` with its
# own settings (deploy/local/.env, written on the first start, mode 600) and its backups on this
# laptop. Devices on the home network join at the laptop's address.
#
#   start [--address <ip>]          settings and images the first time (the internet is needed
#                                   once), then the stack on the home network's address
#   stop | status | address         stop (data kept); what runs; the join address and its QR code
#   backup                          a database dump now, on this laptop
#   first-dm                        no campaign yet: the Russian Ravenford and the DM's link (once)
#   bring <campaign> --from <ssh-host> [--path <dir>]    move a campaign here from a server
#   return <campaign> --to <ssh-host> [--path <dir>]     move it back
#   import <file> | cancel <campaign>                    finish or undo a move here by hand
#   trust-here                      macOS: trust the laptop's certificate in this user's keychain
#
# Nothing here opens a firewall or trusts a certificate without the owner: the commands that need
# an administrator are printed for them, and trust-here asks first. LTW_ENV_FILE may name other
# settings (a check of a second stack on one machine, deploy/verify/local-mode.sh).
set -euo pipefail

LOCAL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
export LTW_ENV_FILE=${LTW_ENV_FILE:-$LOCAL_DIR/.env}
# shellcheck source-path=SCRIPTDIR source=../scripts/lib.sh
source "$LOCAL_DIR/../scripts/lib.sh"

# Before the first start there are no settings: say how to make them.
require_env_file() {
  [ -f "$ENV_FILE" ] || die "no local settings yet: run $0 start first"
}

MOVES_DIR="$LOCAL_DIR/moves"
SCRIPTS="$DEPLOY_DIR/scripts"
REMOTE_PATH_DEFAULT=/opt/ltw
LOCAL_BACKEND_PREFIX=10.231.252

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# The laptop's address on the network its default route leaves by.
home_address() {
  local interface address
  case $(uname -s) in
    Darwin)
      interface=$(route -n get default 2>/dev/null | awk '/interface:/ { print $2 }')
      [ -n "$interface" ] || die 'no network: join the home Wi-Fi first'
      address=$(ipconfig getifaddr "$interface" 2>/dev/null || true)
      ;;
    *)
      address=$(ip -4 route get 1.1.1.1 2>/dev/null |
        awk '{ for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1) }')
      ;;
  esac
  [ -n "$address" ] || die "cannot tell this laptop's address on the home network (start --address <ip>)"
  echo "$address"
}

# A home network's address only (10/8, 172.16/12, 192.168/16; 127/8 for a check on this machine).
valid_address() {
  [[ $1 =~ ^([0-9]{1,3})\.([0-9]{1,3})\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || die "not an IPv4 address: $1"
  local first=${BASH_REMATCH[1]} second=${BASH_REMATCH[2]}
  case $first in
    10 | 127) return 0 ;;
    172) [ "$second" -ge 16 ] && [ "$second" -le 31 ] && return 0 ;;
    192) [ "$second" -eq 168 ] && return 0 ;;
  esac
  die "$1 is not a home network's address: the game on this laptop is for the home network only"
}

# The first start: settings with fresh secrets, never printed.
write_settings() {
  local address=$1 backups=$HOME/Documents/LTW-local-backups
  mkdir -p "$backups"
  (
    umask 077
    {
      echo '# Local mode (docs/adr/0061-local-mode.md): written by deploy/local/ltw-local.sh.'
      echo 'COMPOSE_PROJECT_NAME=ltw-local'
      echo 'LTW_IMAGE_TAG='
      echo "PUBLIC_HOST=$address"
      echo "PUBLIC_ORIGIN=https://$address"
      echo 'TLS_MODE=internal'
      echo 'LTW_PROXY_MODE=local'
      echo "PROXY_HTTP_PUBLISH=$address:80"
      echo "PROXY_HTTPS_PUBLISH=$address:443"
      echo "LTW_BACKEND_PREFIX=$LOCAL_BACKEND_PREFIX"
      echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
      echo "BACKUP_DIR=$backups"
    } >"$ENV_FILE"
  )
  say "settings written: $ENV_FILE (mode 600); backups in $backups"
}

# A new address (the router gave another): what reads it follows.
follow_address() {
  local address=$1
  [ "$(env_value PUBLIC_HOST)" = "$address" ] && return 0
  say "the laptop's address is now $address"
  set_env_value PUBLIC_HOST "$address"
  set_env_value PUBLIC_ORIGIN "https://$address"
  set_env_value PROXY_HTTP_PUBLISH "$address:80"
  set_env_value PROXY_HTTPS_PUBLISH "$address:443"
}

# What the firewall lets in; only printed advice, never a change.
firewall_check() {
  local tool=/usr/libexec/ApplicationFirewall/socketfilterfw
  if [ -x "$tool" ]; then
    if "$tool" --getblockall 2>/dev/null | grep -qi 'enabled'; then
      say 'macOS blocks every incoming connection: devices cannot join. System Settings → Network → Firewall → Options → turn off "Block all incoming connections".'
    elif "$tool" --getglobalstate 2>/dev/null | grep -qi 'enabled'; then
      say 'macOS firewall is on: when macOS asks whether Docker may accept incoming connections, allow it (System Settings → Network → Firewall → Options).'
    else
      say 'macOS firewall is off: the home network reaches ports 80 and 443 of this laptop.'
    fi
  elif command -v ufw >/dev/null 2>&1 && systemctl is-active --quiet ufw 2>/dev/null; then
    say "ufw is active: allow the home network, e.g. sudo ufw allow from $(env_value PUBLIC_HOST | cut -d. -f1-3).0/24 to any port 80,443 proto tcp"
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    say 'firewalld is running: allow http and https, e.g. sudo firewall-cmd --add-service=http --add-service=https'
  fi
}

show_address() {
  local address fingerprint
  address=$(env_value PUBLIC_HOST)
  say "on a phone or tablet: open http://$address/ (or scan the code below) — once, to trust this laptop"
  say "then the table is at https://$address/"
  # The page comes over plain HTTP: the certificate a phone installs is checked against this.
  fingerprint=$(compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt </dev/null |
    openssl x509 -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2) || true
  [ -z "$fingerprint" ] ||
    say "the laptop's certificate, SHA-256: $fingerprint — a phone's must show the same before you trust it"
  node "$LOCAL_DIR/qr.mjs" "http://$address/" 2>/dev/null || true
}

start() {
  local address=
  while [ $# -gt 0 ]; do
    case $1 in
      --address)
        address=${2:?--address needs an IPv4 address}
        shift 2
        ;;
      *) usage ;;
    esac
  done
  [ -n "$address" ] || address=$(home_address)
  valid_address "$address"
  require_docker_engine
  [ -f "$ENV_FILE" ] || write_settings "$address"
  follow_address "$address"
  local commit tag running
  # Exactly as build.sh tags it: the commit's first 12 characters (--short may give more).
  commit=$(git -C "$REPO_DIR" rev-parse --verify HEAD)
  tag=${commit:0:12}
  if ! docker image inspect "ltw-server:$tag" "ltw-proxy:$tag" >/dev/null 2>&1; then
    say "building the images of $tag (the internet is needed for this once)"
    "$SCRIPTS/build.sh" "$tag" >/dev/null
  fi
  firewall_check
  running=$(env_value LTW_IMAGE_TAG)
  if [ "$running" = "$tag" ]; then
    compose up --detach --wait --wait-timeout 300
  else
    "$SCRIPTS/deploy.sh" "$tag"
  fi
  show_address
}

# The name a server's screens show for this laptop while a campaign plays here.
laptop_name() {
  local name
  name=$(scutil --get ComputerName 2>/dev/null || hostname -s 2>/dev/null || echo "the DM's laptop")
  echo "${name:0:80}"
}

# move_args <campaign> <--from|--to> <host> [--path <dir>]: sets campaign, host and remote.
move_args() {
  campaign=${1:-}
  [[ $campaign =~ ^[a-z0-9][a-z0-9_-]{0,63}$ ]] || die "not a campaign ID: $campaign"
  [ "${2:-}" = "$3" ] || usage
  host=${4:?$3 needs an SSH host}
  remote=$REMOTE_PATH_DEFAULT
  if [ "${5:-}" = --path ]; then remote=${6:?--path needs a directory}; fi
}

package_file() {
  mkdir -p "$MOVES_DIR"
  chmod 700 "$MOVES_DIR"
  echo "$MOVES_DIR/$1-$(date -u +%Y%m%dT%H%M%SZ)-$2.ltwcampaign"
}

bring() {
  local campaign host remote file
  move_args "$1" "${2:-}" --from "${3:-}" "${4:-}" "${5:-}"
  file=$(package_file "$campaign" in)
  say "moving $campaign here from $host: it is marked away there"
  (
    umask 077
    # shellcheck disable=SC2029 # the quoted values expand here, for the server's shell
    ssh "$host" "cd $(printf %q "$remote") && deploy/scripts/campaign-move.sh export $(printf %q "$campaign") --move $(printf %q "$(laptop_name)")" >"$file"
  )
  say "package kept: $file"
  if ! "$SCRIPTS/campaign-move.sh" import <"$file"; then
    say "the import here failed; the campaign stays away on $host. Try again: $0 import $file"
    say "or cancel the move there: ssh $host 'cd $remote && deploy/scripts/campaign-move.sh cancel $campaign'"
    exit 1
  fi
  forget_older "$campaign" "$file"
  say "$campaign plays here now"
}

# A package holds password hashes: only the newest of a campaign stays, as the move's copy.
forget_older() {
  local older
  for older in "$MOVES_DIR/$1"-*.ltwcampaign; do
    [ -e "$older" ] && [ "$older" != "$2" ] && rm -f -- "$older"
  done
  return 0
}

return_campaign() {
  local campaign host remote file
  move_args "$1" "${2:-}" --to "${3:-}" "${4:-}" "${5:-}"
  file=$(package_file "$campaign" out)
  say "moving $campaign back to $host: it is marked away here"
  (
    umask 077
    "$SCRIPTS/campaign-move.sh" export "$campaign" --move "$host" >"$file"
  )
  say "package kept: $file"
  # shellcheck disable=SC2029 # the quoted path expands here, for the server's shell
  if ! ssh "$host" "cd $(printf %q "$remote") && deploy/scripts/campaign-move.sh import" <"$file"; then
    say "the import on $host failed; the campaign stays away here. Try again, or cancel: $0 cancel $campaign"
    exit 1
  fi
  forget_older "$campaign" "$file"
  say "$campaign plays on $host again"
}

trust_here() {
  [ "$(uname -s)" = Darwin ] || die 'trust-here is for macOS; elsewhere, open http://<address>/ for the steps'
  local file="$LOCAL_DIR/ltw-local-root.crt" answer
  compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt >"$file"
  openssl x509 -in "$file" -noout -subject -fingerprint -sha256
  printf 'Trust this certificate for websites in your login keychain? macOS asks for your password. [y/N] '
  read -r answer
  case $answer in
    y | Y) security add-trusted-cert -r trustRoot -p ssl -k "$HOME/Library/Keychains/login.keychain-db" "$file" ;;
    *) say 'nothing changed' ;;
  esac
}

case ${1:-} in
  start) shift && start "$@" ;;
  stop) require_env_file && compose stop ;;
  status) require_env_file && compose ps && show_address ;;
  address) require_env_file && show_address ;;
  backup) require_env_file && "$SCRIPTS/backup-now.sh" ;;
  first-dm) require_env_file && "$SCRIPTS/review-campaign.sh" ;;
  bring) shift && require_env_file && bring "$@" ;;
  return) shift && require_env_file && return_campaign "$@" ;;
  import) require_env_file && "$SCRIPTS/campaign-move.sh" import <"${2:?import needs a package file}" ;;
  cancel) require_env_file && "$SCRIPTS/campaign-move.sh" cancel "${2:?cancel needs a campaign}" ;;
  trust-here) require_env_file && trust_here ;;
  *) usage ;;
esac
