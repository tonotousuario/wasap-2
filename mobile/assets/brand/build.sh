#!/usr/bin/env bash
# Regenerates the app's PNG assets from the SVG sources in this folder. Needs rsvg-convert.
# Set IMPECCABLE to the Impeccable launcher to record each PNG's provenance (origin) in it.
set -euo pipefail
cd "$(dirname "$0")"
out=..
render() { # svg png
  rsvg-convert -w 1024 -h 1024 "$1" -o "$out/$2"
  if [[ -n "${IMPECCABLE:-}" ]]; then
    "$IMPECCABLE" embed-prompt "$out/$2" --prompt "Origin: rendered with rsvg-convert from the hand-authored vector source mobile/assets/brand/$1 (mobile/assets/brand/build.sh). Concept explored with Codex image generation; not generated." >/dev/null
  fi
}
render icon.svg icon.png
render adaptive-foreground.svg adaptive-foreground.png
render monochrome.svg adaptive-monochrome.png
render splash.svg splash-icon.png
[[ -n "${IMPECCABLE:-}" ]] || echo "Note: IMPECCABLE not set; PNGs written without provenance metadata." >&2
echo "Assets written to $(cd "$out" && pwd)"
