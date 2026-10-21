#!/bin/bash
# Wraps a built pidash-sign binary in "Proud Indian Signing.app" and a .dmg,
# and optionally a zip of the app, which is what the helper updates itself from.
#
#   macos/build-dmg.sh <pidash-sign binary> <output .dmg> [<output .zip>]
#
# macOS hands a URL to an app as an Apple Event, not an argument, so the app
# is a small AppleScript applet that receives pidash-sign:// links and runs
# the helper beside it. Everything is ad-hoc signed: no Apple certificate, so
# the first open needs Open Anyway in System Settings.
set -euo pipefail

BINARY="$1"
OUTPUT="$2"
ZIP="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
APP="$WORK/dmg/Proud Indian Signing.app"
PLIST="$APP/Contents/Info.plist"

mkdir -p "$WORK/dmg"
osacompile -o "$APP" "$HERE/handler.applescript"
install -m 0755 "$BINARY" "$APP/Contents/MacOS/pidash-sign"
plist() { /usr/libexec/PlistBuddy -c "$1" "$PLIST"; }
plist "Set :CFBundleIdentifier ngo.proudindian.pidash-sign" 2>/dev/null \
  || plist "Add :CFBundleIdentifier string ngo.proudindian.pidash-sign"
# Launch Services prefers the newest version when two apps claim pidash-sign://.
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' "$HERE/../Cargo.toml" | head -1)
for key in CFBundleShortVersionString CFBundleVersion; do
  plist "Set :$key $VERSION" 2>/dev/null || plist "Add :$key string $VERSION"
done
plist "Add :LSUIElement bool true"
plist "Add :CFBundleURLTypes array"
plist "Add :CFBundleURLTypes:0 dict"
plist "Add :CFBundleURLTypes:0:CFBundleURLName string Proud Indian signing"
plist "Add :CFBundleURLTypes:0:CFBundleURLSchemes array"
plist "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string pidash-sign"
codesign --force --sign - "$APP/Contents/MacOS/pidash-sign"
codesign --force --sign - "$APP"
codesign --verify --strict "$APP"

if [ -n "$ZIP" ]; then
  rm -f "$ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"
fi

ln -s /Applications "$WORK/dmg/Applications"
rm -f "$OUTPUT"
hdiutil create -quiet -volname "Proud Indian Signing" -srcfolder "$WORK/dmg" \
  -format UDZO "$OUTPUT"
