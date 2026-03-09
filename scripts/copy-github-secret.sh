#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 {clasprc|deployment-id}" >&2
  exit 1
fi

if ! command -v pbcopy >/dev/null 2>&1; then
  echo "Error: pbcopy command not found." >&2
  exit 1
fi

case "$TARGET" in
  clasprc)
    if [[ ! -s "$HOME/.clasprc.json" ]]; then
      echo "Error: $HOME/.clasprc.json not found." >&2
      exit 1
    fi
    tr -d '\n\r' < "$HOME/.clasprc.json" | pbcopy
    echo "Copied value for CLASPRC_JSON to clipboard."
    ;;
  deployment-id)
    if [[ ! -s "$ROOT_DIR/.gas-deployment-id" ]]; then
      echo "Error: $ROOT_DIR/.gas-deployment-id not found." >&2
      exit 1
    fi
    tr -d ' \t\r\n' < "$ROOT_DIR/.gas-deployment-id" | pbcopy
    echo "Copied value for GAS_DEPLOYMENT_ID to clipboard."
    ;;
  *)
    echo "Usage: $0 {clasprc|deployment-id}" >&2
    exit 1
    ;;
esac
