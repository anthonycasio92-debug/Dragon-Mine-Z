#!/usr/bin/env bash
#
# Dev harness for the Dragon-Mine-Z CustomNPCs script pack.
#
# These .js files have no build step and run on Nashorn (ES5) inside a modded
# Minecraft server. This script gives developers a local feedback loop:
#   1. "lint/test": compile every .js on the real Nashorn engine (ES5 syntax check)
#   2. "run/demo":  execute the real Jump.js tick() with mocked game APIs
#
# It is self-contained: it downloads the Nashorn engine jars if they are missing,
# then lazily compiles the tiny Java validator before running.
#
# Usage:
#   bash tools/validate/run.sh            # lint all scripts + run demo
#   bash tools/validate/run.sh --lint     # lint all scripts only
#   bash tools/validate/run.sh --demo     # run Jump.js demo only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/tools/nashorn/lib"
OUT="$ROOT/tools/validate/out"
CP="$LIB/*"

MODE="${1:-all}"

fetch_jars() {
  mkdir -p "$LIB"
  local base="https://repo1.maven.org/maven2"
  local jars=(
    "org/openjdk/nashorn/nashorn-core/15.6/nashorn-core-15.6.jar"
    "org/ow2/asm/asm/9.6/asm-9.6.jar"
    "org/ow2/asm/asm-commons/9.6/asm-commons-9.6.jar"
    "org/ow2/asm/asm-tree/9.6/asm-tree-9.6.jar"
    "org/ow2/asm/asm-util/9.6/asm-util-9.6.jar"
    "org/ow2/asm/asm-analysis/9.6/asm-analysis-9.6.jar"
  )
  for j in "${jars[@]}"; do
    local dest="$LIB/$(basename "$j")"
    if [ ! -f "$dest" ]; then
      echo "Downloading $(basename "$j")..."
      curl -fsSL --retry 3 -o "$dest" "$base/$j"
    fi
  done
}

compile_validator() {
  mkdir -p "$OUT"
  if [ ! -f "$OUT/NashornValidate.class" ] || \
     [ "$ROOT/tools/validate/NashornValidate.java" -nt "$OUT/NashornValidate.class" ]; then
    echo "Compiling NashornValidate.java..."
    javac -cp "$CP" -d "$OUT" "$ROOT/tools/validate/NashornValidate.java"
  fi
}

lint() {
  ( cd "$ROOT" && java -cp "$OUT:$CP" NashornValidate )
}

demo() {
  ( cd "$ROOT" && java -cp "$CP" org.openjdk.nashorn.tools.Shell \
      "$ROOT/tools/validate/jump_demo.js" "$ROOT/Jump.js" )
}

fetch_jars
compile_validator

case "$MODE" in
  --lint) lint ;;
  --demo) demo ;;
  all|"")
    status=0
    lint || status=$?
    echo
    demo
    exit $status
    ;;
  *) echo "Unknown option: $MODE" >&2; exit 2 ;;
esac
