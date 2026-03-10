#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-all}"
OLD_REGEX='前月をアーカイブ|前月アーカイブ'
NEW_BUTTON_TEXT='月別へアーカイブ'
NEW_DONE_TEXT='月別アーカイブ'

die() {
  echo "Error: $*" >&2
  exit 1
}

check_local() {
  local files=(
    "$ROOT_DIR/Code.gs"
    "$ROOT_DIR/Index.html"
    "$ROOT_DIR/modern-webapp/public/index.html"
    "$ROOT_DIR/modern-webapp/public/app.js"
  )

  if rg -n "$OLD_REGEX" "${files[@]}" >/dev/null; then
    rg -n "$OLD_REGEX" "${files[@]}" >&2 || true
    die "legacy archive labels are still present in local files."
  fi

  rg -n "$NEW_BUTTON_TEXT" "$ROOT_DIR/Code.gs" "$ROOT_DIR/Index.html" "$ROOT_DIR/modern-webapp/public/index.html" >/dev/null \
    || die "new button label not found in expected local files."
  rg -n "$NEW_DONE_TEXT" "$ROOT_DIR/Index.html" "$ROOT_DIR/modern-webapp/public/app.js" >/dev/null \
    || die "new completion label not found in expected local files."

  echo "OK local: archive labels are unified."
}

pages_url_from_origin() {
  local origin owner repo
  origin="$(git -C "$ROOT_DIR" config --get remote.origin.url || true)"
  [[ -n "$origin" ]] || return 1

  if [[ "$origin" =~ github.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
    echo "https://${owner}.github.io/${repo}/"
    return 0
  fi

  return 1
}

check_endpoint() {
  local label="$1"
  local url="$2"
  local html

  html="$(curl -LfsS "$url")" || die "${label} fetch failed: ${url}"

  if echo "$html" | rg -n "$OLD_REGEX" >/dev/null; then
    die "${label} still contains legacy archive labels: ${url}"
  fi
  if ! echo "$html" | rg -n "$NEW_BUTTON_TEXT|$NEW_DONE_TEXT" >/dev/null; then
    die "${label} does not contain new archive labels yet: ${url}"
  fi

  echo "OK ${label}: archive labels are updated."
}

check_gas() {
  local deploy_file="$ROOT_DIR/.gas-deployment-id"
  [[ -s "$deploy_file" ]] || die ".gas-deployment-id not found."
  local deploy_id gas_url
  deploy_id="$(tr -d ' \t\r\n' < "$deploy_file" | sed -E 's/^["'"'"']+|["'"'"']+$//g')"
  [[ -n "$deploy_id" ]] || die "deployment id is empty."
  gas_url="https://script.google.com/macros/s/${deploy_id}/exec"
  check_endpoint "gas" "$gas_url"
}

check_pages() {
  local pages_url
  pages_url="$(pages_url_from_origin)" || die "failed to derive GitHub Pages URL from origin."
  check_endpoint "pages" "$pages_url"
}

case "$MODE" in
  local)
    check_local
    ;;
  gas)
    check_gas
    ;;
  pages)
    check_pages
    ;;
  remote)
    check_gas
    check_pages
    ;;
  all)
    check_local
    check_gas
    check_pages
    ;;
  *)
    die "usage: $0 {local|gas|pages|remote|all}"
    ;;
esac
