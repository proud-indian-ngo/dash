#!/usr/bin/env bash
# Copies the brand files apps/web serves from public/ out of the installed
# @proudindian/design, so they never drift from the design system:
#
#   bash scripts/sync-brand-assets.sh
#
# The favicons, home-screen icons and their manifest come from logo/favicon
# as they are. Email clients don't render SVG, so the email header logo is
# logo/svg/pi-lockup-compact.svg rendered at three times the 28 px height
# email-layout.tsx shows it at. Run it after upgrading @proudindian/design.
# Needs rsvg-convert (librsvg) and jq.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
design="$root/apps/web/node_modules/@proudindian/design/logo"
public="$root/apps/web/public"
[ -d "$design" ] || { echo "Install dependencies first: $design is missing." >&2; exit 1; }

for file in favicon.svg favicon-16.png favicon-32.png favicon-48.png \
  apple-touch-icon-180.png icon-192.png icon-512.png; do
  cp "$design/favicon/$file" "$public/$file"
done
# The dashboard's own name, and root-relative icon paths.
jq '.name = "Proud Indian Dashboard" | .icons |= map(.src = "/" + .src)' \
  "$design/favicon/site.webmanifest" >"$public/site.webmanifest"

rsvg-convert --height 84 "$design/svg/pi-lockup-compact.svg" -o "$public/email-logo.png"
