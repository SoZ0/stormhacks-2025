#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
TECH_DIR="$ROOT_DIR/tech"
WEB_DIR="$ROOT_DIR/web"
OUTPUT_DIR="${1:-$ROOT_DIR/dist}"
WEB_BUILD_DIR="$WEB_DIR/build"

log() {
  echo "[build-sites] $*"
}

abort() {
  echo "[build-sites] error: $*" >&2
  exit 1
}

pick_package_manager() {
  if command -v bun >/dev/null 2>&1 && [[ -f "$WEB_DIR/bun.lock" ]]; then
    echo "bun"
    return 0
  fi
  if command -v pnpm >/dev/null 2>&1 && [[ -f "$WEB_DIR/pnpm-lock.yaml" ]]; then
    echo "pnpm"
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    echo "npm"
    return 0
  fi
  abort "no supported package manager found (bun, pnpm, npm)"
}

run_install() {
  case "$1" in
    bun)
      (cd "$WEB_DIR" && bun install)
      ;;
    pnpm)
      (cd "$WEB_DIR" && pnpm install)
      ;;
    npm)
      (cd "$WEB_DIR" && npm install)
      ;;
    *)
      abort "unsupported package manager: $1"
      ;;
  esac
}

run_build() {
  case "$1" in
    bun)
      (cd "$WEB_DIR" && rm -rf "$WEB_BUILD_DIR" && TAURI_BUILD=1 bun run build)
      ;;
    pnpm)
      (cd "$WEB_DIR" && rm -rf "$WEB_BUILD_DIR" && TAURI_BUILD=1 pnpm run build)
      ;;
    npm)
      (cd "$WEB_DIR" && rm -rf "$WEB_BUILD_DIR" && TAURI_BUILD=1 npm run build)
      ;;
    *)
      abort "unsupported package manager: $1"
      ;;
  esac
}

[[ -f "$TECH_DIR/index.html" ]] || abort "could not find tech site at $TECH_DIR"
[[ -f "$WEB_DIR/package.json" ]] || abort "could not find web project at $WEB_DIR"

PACKAGE_MANAGER="$(pick_package_manager)"
log "Using $PACKAGE_MANAGER for web build"

log "Cleaning output directory: $OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  log "Installing web dependencies"
  run_install "$PACKAGE_MANAGER"
fi

log "Building web app for static hosting"
run_build "$PACKAGE_MANAGER"

[[ -d "$WEB_BUILD_DIR" ]] || abort "expected build output in $WEB_BUILD_DIR"

log "Copying tech site into root of $OUTPUT_DIR"
cp -a "$TECH_DIR/." "$OUTPUT_DIR/"

log "Copying web app into $OUTPUT_DIR/demo"
rm -rf "$OUTPUT_DIR/demo"
mkdir -p "$OUTPUT_DIR/demo"
cp -a "$WEB_BUILD_DIR/." "$OUTPUT_DIR/demo/"

log "Build complete; output ready in $OUTPUT_DIR"
