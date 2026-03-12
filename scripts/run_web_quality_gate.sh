#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${1:-$(pwd)}"
REPO_PATH="$(cd "$REPO_PATH" && pwd)"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

log() {
  printf '%s\n' "$*"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  log "[PASS] $*"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  log "[FAIL] $*"
}

skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  log "[SKIP] $*"
}

has_npm_script() {
  local package_json="$1"
  local script_name="$2"
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit(pkg && pkg.scripts && pkg.scripts[process.argv[2]] ? 0 : 1);
  ' "$package_json" "$script_name" >/dev/null 2>&1
}

run_npm_if_present() {
  local dir="$1"
  local package_json="$dir/package.json"
  local script_name="$2"
  if [[ ! -f "$package_json" ]]; then
    skip "$dir: package.json not found ($script_name)"
    return 0
  fi
  if ! has_npm_script "$package_json" "$script_name"; then
    skip "$dir: npm script '$script_name' not defined"
    return 0
  fi
  log "[RUN ] $dir: npm run $script_name"
  if (cd "$dir" && npm run "$script_name"); then
    pass "$dir: npm run $script_name"
  else
    fail "$dir: npm run $script_name"
  fi
}

run_python_checks() {
  local dir="$1"
  local has_python_config=0
  if [[ -f "$dir/pyproject.toml" ]]; then
    has_python_config=1
  fi
  if compgen -G "$dir/requirements*.txt" > /dev/null; then
    has_python_config=1
  fi
  if [[ "$has_python_config" -eq 0 ]]; then
    skip "$dir: no Python project files"
    return 0
  fi

  if command -v ruff >/dev/null 2>&1; then
    log "[RUN ] $dir: ruff check ."
    if (cd "$dir" && ruff check .); then
      pass "$dir: ruff check ."
    else
      fail "$dir: ruff check ."
    fi
  else
    skip "$dir: ruff not installed"
  fi

  if command -v pytest >/dev/null 2>&1; then
    log "[RUN ] $dir: pytest -q"
    if (cd "$dir" && pytest -q); then
      pass "$dir: pytest -q"
    else
      fail "$dir: pytest -q"
    fi
  else
    skip "$dir: pytest not installed"
  fi
}

check_changed_php_syntax() {
  if ! command -v php >/dev/null 2>&1; then
    skip "php: not installed"
    return 0
  fi

  local files
  files="$(cd "$REPO_PATH" && git diff --name-only -- '*.php' || true)"
  if [[ -z "$files" ]]; then
    skip "php: no changed PHP files"
    return 0
  fi

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    log "[RUN ] php -l $file"
    if php -l "$REPO_PATH/$file" >/dev/null; then
      pass "php -l $file"
    else
      fail "php -l $file"
    fi
  done <<< "$files"
}

check_local_links_in_changed_web_files() {
  local changed_files
  changed_files="$(cd "$REPO_PATH" && git diff --name-only -- '*.html' '*.htm' '*.js' '*.css' || true)"
  if [[ -z "$changed_files" ]]; then
    skip "link check: no changed web files"
    return 0
  fi

  local output_file
  output_file="$(mktemp)"
  if (cd "$REPO_PATH" && node - "$REPO_PATH" "$output_file" <<'NODE'
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repo = process.argv[2];
const outputPath = process.argv[3];
const diff = cp.execSync(`git -C "${repo.replace(/"/g, '\\"')}" diff --name-only -- '*.html' '*.htm' '*.js' '*.css'`, { encoding: 'utf8' });
const files = diff.split('\n').map((v) => v.trim()).filter(Boolean);
const errors = [];
const attrPattern = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

function shouldSkip(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (text.startsWith('#')) return true;
  if (text.startsWith('http://') || text.startsWith('https://')) return true;
  if (text.startsWith('//')) return true;
  if (text.startsWith('mailto:') || text.startsWith('tel:')) return true;
  if (text.startsWith('data:') || text.startsWith('blob:')) return true;
  if (text.startsWith('javascript:')) return true;
  if (text.includes('{') || text.includes('<%')) return true;
  return false;
}

function normalizeReference(ref) {
  const withoutHash = ref.split('#')[0];
  return withoutHash.split('?')[0];
}

for (const file of files) {
  const absFile = path.join(repo, file);
  if (!fs.existsSync(absFile)) continue;
  const content = fs.readFileSync(absFile, 'utf8');
  let match;
  while ((match = attrPattern.exec(content)) !== null) {
    const rawRef = String(match[1] || '').trim();
    if (shouldSkip(rawRef)) continue;
    const normalized = normalizeReference(rawRef);
    if (!normalized) continue;

    let target;
    if (normalized.startsWith('/')) {
      target = path.join(repo, normalized.slice(1));
    } else {
      target = path.resolve(path.dirname(absFile), normalized);
    }
    if (!fs.existsSync(target)) {
      errors.push(`${file}: missing ${rawRef} -> ${path.relative(repo, target)}`);
    }
  }
}

fs.writeFileSync(outputPath, errors.join('\n'), 'utf8');
process.exit(errors.length ? 1 : 0);
NODE
  ); then
    pass "link check: changed web files"
  else
    fail "link check: changed web files"
    if [[ -s "$output_file" ]]; then
      sed 's/^/  - /' "$output_file"
    fi
  fi
  rm -f "$output_file"
}

log "== Web Quality Gate =="
log "Repository: $REPO_PATH"

run_npm_if_present "$REPO_PATH" "lint"
run_npm_if_present "$REPO_PATH" "typecheck"
run_npm_if_present "$REPO_PATH" "test"
run_npm_if_present "$REPO_PATH" "build"

run_npm_if_present "$REPO_PATH/modern-webapp" "lint"
run_npm_if_present "$REPO_PATH/modern-webapp" "typecheck"
run_npm_if_present "$REPO_PATH/modern-webapp" "test"
run_npm_if_present "$REPO_PATH/modern-webapp" "build"

run_python_checks "$REPO_PATH"
check_changed_php_syntax
check_local_links_in_changed_web_files

log "== Summary =="
log "PASS: $PASS_COUNT"
log "FAIL: $FAIL_COUNT"
log "SKIP: $SKIP_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi

