#!/usr/bin/env bash
set -euo pipefail

# GitHub suppresses push checks for these messages; waiting cannot make them pass.
commit=${GIT_COMMIT:-HEAD}
message=$(git log -1 --format=%B "$commit")
if printf '%s\n' "$message" | grep -Eiq '\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|^[[:space:]]*skip-checks:[[:space:]]*true[[:space:]]*$'; then
  echo 'Deployment refused: this commit skips required GitHub checks. Create a release commit without a CI skip instruction, then let its checks pass.' >&2
  exit 1
fi
