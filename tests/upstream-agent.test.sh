#!/usr/bin/env bash

set -euo pipefail

prompt_launcher=/usr/share/omarchy/bin/omarchy-agent-prompt
if [[ ! -x $prompt_launcher ]]; then
  echo "Omarchy Agent launcher unavailable; upstream contract tests skipped"
  exit 0
fi

fixture_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/fixtures" && pwd)"
test_path="$fixture_dir:/usr/share/omarchy/bin:$PATH"
hostile_prompt='中文 '\''single'\'' "double" `backtick`; pipe | $(touch /tmp/omast-pwned) 💡'

safe_output="$({
  OMAST_TEST_AGENT=codex \
  OMAST_TEST_MISSING=0 \
  PATH="$test_path" \
  "$prompt_launcher" "$hostile_prompt"
})"

jq -e --arg prompt "$hostile_prompt" '
  . == [
    "--app-id=org.omarchy.agent",
    "codex",
    "--approve-for-me",
    "--",
    $prompt
  ]
' <<<"$safe_output" >/dev/null

if no_default_error="$({
  OMAST_TEST_AGENT= \
  OMAST_TEST_MISSING=0 \
  PATH="$test_path" \
  "$prompt_launcher" hello >/dev/null
} 2>&1)"; then
  echo "Agent launcher unexpectedly accepted an empty default Agent" >&2
  exit 1
else
  no_default_status=$?
fi
[[ $no_default_status -eq 1 ]]
[[ $no_default_error == *"Choose default agent"* ]]

if missing_error="$({
  OMAST_TEST_AGENT=codex \
  OMAST_TEST_MISSING=1 \
  PATH="$test_path" \
  "$prompt_launcher" hello >/dev/null
} 2>&1)"; then
  echo "Agent launcher unexpectedly accepted a missing Agent" >&2
  exit 1
else
  missing_status=$?
fi
[[ $missing_status -eq 1 ]]
[[ $missing_error == *"codex is not installed"* ]]

echo "upstream Agent launcher contract tests passed"
