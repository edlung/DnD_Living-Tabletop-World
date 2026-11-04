#!/usr/bin/env bash
# campaign-move.sh: a campaign's move between servers (docs/adr/0061-local-mode.md §5–6;
# deploy/RUNBOOK.md section 15), run where the campaign is and where it goes:
#   campaign-move.sh export <campaign> [--move <where>]   the package (gzip) on standard output;
#                                                        --move marks the campaign away here
#   campaign-move.sh import                              a package from standard input; a
#                                                        protected dump (kind prerestore) first
#   campaign-move.sh status <campaign>                   at home, or away (where, since when)
#   campaign-move.sh cancel <campaign>                   ends a move whose package never came in
# The package holds the campaign's accounts' password hashes: keep it like a backup (mode 600),
# never in a ticket, a chat or a log. Reports are one JSON line on standard error.
source "$(dirname "$0")/lib.sh"
require_env_file

CLI="$SERVER_DIST/campaigns/move/campaign-move-cli.js"
usage='usage: campaign-move.sh export <campaign> [--move <where>] | import | status <campaign> | cancel <campaign>'
service_running server || die 'the server is not running (dc up first)'

case ${1:-} in
  export)
    campaign=${2:?$usage}
    if [ "${3:-}" = --move ]; then
      server_node "$CLI" export --campaign "$campaign" --move --to "${4:?--move needs where the campaign goes}"
    else
      [ $# -eq 2 ] || die "$usage"
      server_node "$CLI" export --campaign "$campaign"
    fi
    ;;
  import)
    [ $# -eq 1 ] || die "$usage"
    # What the import changes can come back: a protected dump, kept apart from the retention.
    # Its input is not the package: standard input is the import's alone.
    dump=$(compose exec -T backup /bin/sh /opt/ltw/backup.sh pre-restore </dev/null)
    say "protected dump before the import: $dump" >&2
    server_node "$CLI" import
    ;;
  status | cancel)
    [ $# -eq 2 ] || die "$usage"
    server_node "$CLI" "$1" --campaign "$2"
    ;;
  *) die "$usage" ;;
esac
