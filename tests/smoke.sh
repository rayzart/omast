#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

jq empty manifest.json
jq -e '
  .schemaVersion == 1 and
  .id == "io.github.rayzart.omast" and
  (.kinds | index("menu")) != null and
  .entryPoints.menu == "Omast.qml"
' manifest.json >/dev/null

test -f Omast.qml
test -f README.md
test -f LICENSE

if find . -path './.git' -prune -o -type l -print -quit | grep -q .; then
  echo "symlinks are not allowed in the plugin repository" >&2
  exit 1
fi

if rg -n '(^|[^A-Za-z])(eval|sh -c|bash -c)([^A-Za-z]|$)' Omast.qml OmastModel.js; then
  echo "shell evaluation primitive found in executable plugin source" >&2
  exit 1
fi

node tests/model.test.js
tests/upstream-agent.test.sh

if command -v omarchy >/dev/null 2>&1; then
  omarchy plugin validate .
else
  echo "omarchy not installed; official validator skipped"
fi

qml_linter="$(command -v qmllint || true)"
if [[ -z "$qml_linter" && -x /usr/lib/qt6/bin/qmllint ]]; then
  qml_linter=/usr/lib/qt6/bin/qmllint
fi

if [[ -n "$qml_linter" && -n "${OMARCHY_PATH:-}" && -d "$OMARCHY_PATH/shell" ]]; then
  lint_root="$(mktemp -d /tmp/omast-qmllint.XXXXXX)"
  mkdir "$lint_root/qs"
  ln -s "$OMARCHY_PATH/shell/Commons" "$lint_root/qs/Commons"
  ln -s "$OMARCHY_PATH/shell/Ui" "$lint_root/qs/Ui"
  "$qml_linter" -I "$lint_root" Omast.qml
  unlink "$lint_root/qs/Commons"
  unlink "$lint_root/qs/Ui"
  rmdir "$lint_root/qs" "$lint_root"
else
  echo "qmllint or Omarchy shell imports unavailable; QML lint skipped"
fi

echo "smoke checks passed"
