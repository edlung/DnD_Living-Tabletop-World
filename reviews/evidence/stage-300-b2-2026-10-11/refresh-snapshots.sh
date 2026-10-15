#!/bin/sh
# Refresh all three reviewer snapshots to the current canonical artifact (tracked + untracked,
# not ignored, existing files). Generated/dependency paths stay in place and are not part of the artifact.
set -eu
C=/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2
R=/private/tmp/ltw-stage300-checkpoint-b2-review
cd "$C"
git ls-files -co --exclude-standard | while IFS= read -r f; do [ -e "$f" ] && printf '%s\n' "$f"; done | sort > "$R/artifact-files.next.txt"
for who in xhigh codex-unused max; do
  S="$R/$who-snapshot"
  # Remove artifact files that no longer exist in the canonical artifact.
  (cd "$S" && find . -type f \
      -not -path './node_modules/*' -not -path '*/node_modules/*' -not -path '*/dist/*' \
      -not -path './apps/web/build/*' -not -path './test-results/*' -not -path './playwright-report/*' \
      -not -path './coverage/*' | sed 's|^\./||' | sort) > "$R/$who-files.now.txt"
  comm -23 "$R/$who-files.now.txt" "$R/artifact-files.next.txt" | while IFS= read -r stale; do
    rm -f "$S/$stale"; echo "removed $who:$stale"
  done
  rsync -a --files-from="$R/artifact-files.next.txt" "$C/" "$S/"
  mkdir -p -m 755 "$S/packages/domain/src/memory/testing"
done
mv "$R/artifact-files.next.txt" "$R/artifact-files.txt"
cd "$C" && tr '\n' '\0' < "$R/artifact-files.txt" | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1 > "$R/artifact-manifest-sha256.txt"
for who in xhigh codex-unused max; do
  (cd "$R/$who-snapshot" && tr '\n' '\0' < "$R/artifact-files.txt" | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
done
cat "$R/artifact-manifest-sha256.txt"
