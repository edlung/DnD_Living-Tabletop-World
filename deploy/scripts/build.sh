#!/usr/bin/env bash
# build.sh [<git revision>]: builds ltw-server:<tag> and ltw-proxy:<tag> from a committed
# revision (default HEAD), <tag> being its 12-character commit ID, and prints the tag. The build
# context is `git archive` of that revision: uncommitted, ignored and secret files never enter
# an image, and the same revision always builds from the same files (docs/adr/0037-deployment.md).
# Extra `docker build` options may follow the revision, e.g. `--platform linux/amd64`.
source "$(dirname "$0")/lib.sh"

ref=${1:-HEAD}
shift || true
commit=$(git -C "$REPO_DIR" rev-parse --verify --quiet "$ref^{commit}") ||
  die "not a commit: $ref"
tag=${commit:0:12}

# Progress goes to stderr: stdout carries only the tag, for `tag=$(build.sh …)`.
for target in server proxy; do
  say "building ltw-$target:$tag from $commit" >&2
  git -C "$REPO_DIR" archive --format=tar "$commit" |
    docker build --file deploy/Dockerfile --target "$target" \
      --build-arg "LTW_REVISION=$commit" --tag "ltw-$target:$tag" "$@" - >&2
done
echo "$tag"
