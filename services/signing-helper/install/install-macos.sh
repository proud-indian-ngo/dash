#!/bin/bash
# Installs the Proud Indian signing helper on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/proud-indian-ngo/dash/master/services/signing-helper/install/install-macos.sh | bash -s -- https://dash.example.org
#
# Downloads the latest helper release, writes its config (the one pi-dash
# server it may sign for, and the HyperSecu token driver), and registers the
# pidash-sign:// links with a small app in ~/Applications. Nothing needs
# administrator rights. The helper is ad-hoc signed on this Mac.
set -euo pipefail

SERVER="${1:-}"
if [[ -z "$SERVER" ]]; then
  echo "Usage: install-macos.sh https://your-dashboard" >&2
  exit 2
fi
REPO="proud-indian-ngo/dash"
MODULE="${PIDASH_PKCS11_MODULE:-/usr/local/lib/libcastle_v2.1.0.0.dylib}"
BIN_DIR="$HOME/.local/bin"
APP="$HOME/Applications/Proud Indian Signing.app"
CONFIG_DIR="$HOME/.config/pidash-sign"

echo "Finding the latest Proud Indian signing helper..."
TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases" \
  | grep -o '"tag_name": *"signing-helper-v[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$TAG" ]]; then
  echo "No helper release found." >&2
  exit 1
fi
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/helper.tar.gz" \
  "https://github.com/$REPO/releases/download/$TAG/pidash-sign-macos-universal.tar.gz"
mkdir -p "$BIN_DIR"
tar -xzf "$TMP/helper.tar.gz" -C "$TMP"
install -m 0755 "$TMP/pidash-sign" "$BIN_DIR/pidash-sign"
xattr -dr com.apple.quarantine "$BIN_DIR/pidash-sign" 2>/dev/null || true
codesign --force --sign - "$BIN_DIR/pidash-sign"

mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.json" <<JSON
{ "server": "$SERVER", "module": "$MODULE" }
JSON

# macOS delivers a URL to an app as an Apple Event, not an argument, so a
# tiny AppleScript app receives pidash-sign:// links and runs the helper.
rm -rf "$APP"
mkdir -p "$HOME/Applications"
cat > "$TMP/handler.applescript" <<OSA
on open location theURL
  do shell script quoted form of "$BIN_DIR/pidash-sign" & " " & quoted form of theURL & " > /dev/null 2>&1 &"
end open location
OSA
osacompile -o "$APP" "$TMP/handler.applescript"
PLIST="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string ngo.proudindian.pidash-sign" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ngo.proudindian.pidash-sign" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string Proud Indian signing" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string pidash-sign" "$PLIST"
codesign --force --deep --sign - "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
rm -rf "$TMP"

if [[ ! -f "$MODULE" ]]; then
  echo "Note: the token driver wasn't found at $MODULE. Install the HyperSecu (ePass) driver, or edit $CONFIG_DIR/config.json." >&2
fi
echo "Installed $TAG. Plug in your DSC token and return to the dashboard."
