#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLASP_BIN="$ROOT_DIR/node_modules/.bin/clasp"
DEPLOY_ID_FILE="$ROOT_DIR/.gas-deployment-id"

if [[ ! -x "$CLASP_BIN" ]]; then
  echo "Error: clasp not found. Run 'npm ci' first." >&2
  exit 1
fi

NEW_DEPLOY=false
if [[ "${1:-}" == "--new" ]]; then
  NEW_DEPLOY=true
  shift
fi

DESCRIPTION="${*:-auto deploy $(date '+%Y-%m-%d %H:%M:%S')}"

cd "$ROOT_DIR"

echo "[1/3] push"
"$CLASP_BIN" push --force

echo "[2/3] version"
if ! VERSION_OUT="$("$CLASP_BIN" version "$DESCRIPTION" 2>&1)"; then
  echo "Error: clasp version failed." >&2
  echo "$VERSION_OUT" >&2
  exit 1
fi
VERSION_NUM="$(echo "$VERSION_OUT" | sed -n 's/.*Created version \([0-9][0-9]*\).*/\1/p' | tail -n 1)"

if [[ -z "$VERSION_NUM" ]]; then
  echo "Error: failed to parse version number from clasp output." >&2
  echo "$VERSION_OUT" >&2
  exit 1
fi

DEPLOY_ID=""
if [[ "$NEW_DEPLOY" == "false" && -s "$DEPLOY_ID_FILE" ]]; then
  DEPLOY_ID="$(tr -d ' \t\r\n' < "$DEPLOY_ID_FILE")"
fi

if [[ -n "$DEPLOY_ID" ]]; then
  echo "[3/3] redeploy (stable URL)"
  if ! REDEPLOY_OUT="$("$CLASP_BIN" redeploy "$DEPLOY_ID" -V "$VERSION_NUM" -d "$DESCRIPTION" 2>&1)"; then
    echo "Error: clasp redeploy failed." >&2
    echo "$REDEPLOY_OUT" >&2
    exit 1
  fi
else
  echo "[3/3] deploy (new URL)"
  if ! DEPLOY_OUT="$("$CLASP_BIN" deploy -V "$VERSION_NUM" -d "$DESCRIPTION" 2>&1)"; then
    echo "Error: clasp deploy failed." >&2
    echo "$DEPLOY_OUT" >&2
    exit 1
  fi
  DEPLOY_ID="$(echo "$DEPLOY_OUT" | sed -n 's/.*Deployed \([^ ]*\) @.*/\1/p' | tail -n 1)"
  if [[ -z "$DEPLOY_ID" ]]; then
    echo "Error: failed to parse deployment id from clasp output." >&2
    echo "$DEPLOY_OUT" >&2
    exit 1
  fi
  echo "$DEPLOY_ID" > "$DEPLOY_ID_FILE"
fi

if [[ -n "${REDEPLOY_OUT:-}" ]]; then
  echo "$REDEPLOY_OUT"
fi

echo
echo "Deployment ID: $DEPLOY_ID"
echo "Web App URL: https://script.google.com/macros/s/$DEPLOY_ID/exec"
