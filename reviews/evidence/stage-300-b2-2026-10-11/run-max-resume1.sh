#!/bin/sh
date -u +%FT%TZ > "/private/tmp/ltw-stage300-checkpoint-b2-review/max-evidence/turn-02/started-at.txt"
cd "/private/tmp/ltw-stage300-checkpoint-b2-review/max-snapshot" || exit 9
env -i HOME="/Users/oleksandr" PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/pkg/env/global/bin:/opt/homebrew/bin:/Users/oleksandr/.lmstudio/bin:/Users/oleksandr/Library/pnpm:/Users/oleksandr/.local/bin" USER="oleksandr" LANG=en_US.UTF-8 TMPDIR="${TMPDIR:-/tmp}" SHELL=/bin/zsh \
  claude --print --resume "f50a3155-e1b6-42f0-85b1-1dc2e7d48340" --model claude-opus-5-5 --effort max \
  --output-format stream-json --verbose --tools Read,Grep,Glob,Bash --add-dir "/private/tmp/ltw-stage300-checkpoint-b2-review/max-scratch" \
  --allowedTools 'Bash(pnpm run *)' 'Bash(pnpm exec *)' 'Bash(pnpm vitest *)' 'Bash(pnpm --filter *)' 'Bash(node *)' 'Bash(npx vitest *)' 'Bash(npx tsc *)' 'Bash(npx playwright *)' 'Bash(ls *)' 'Bash(cat *)' 'Bash(head *)' 'Bash(tail *)' 'Bash(sed -n *)' 'Bash(wc *)' 'Bash(rg *)' 'Bash(grep *)' 'Bash(find *)' 'Bash(shasum *)' 'Bash(mkdir *)' 'Bash(cp *)' 'Bash(diff *)' 'Bash(jq *)' 'Bash(sort *)' 'Bash(uniq *)' 'Bash(tee *)' 'Bash(echo *)' 'Bash(printf *)' 'Bash(pwd)' 'Bash(lsof -i *)' 'Bash(sleep *)' \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands \
  --settings '{"disableAllHooks":true,"effortLevel":"max"}' --permission-mode dontAsk \
  < "/private/tmp/ltw-stage300-checkpoint-b2-review/delta-max-repair1.txt" > "/private/tmp/ltw-stage300-checkpoint-b2-review/max-evidence/turn-02/stdout.jsonl" 2> "/private/tmp/ltw-stage300-checkpoint-b2-review/max-evidence/turn-02/stderr.txt"
echo "exit=$?" > "/private/tmp/ltw-stage300-checkpoint-b2-review/max-evidence/turn-02/exit.txt"
date -u +%FT%TZ > "/private/tmp/ltw-stage300-checkpoint-b2-review/max-evidence/turn-02/finished-at.txt"
