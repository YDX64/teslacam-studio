#!/bin/bash
# TeslaCamStudio - .app bundle oluşturucu
# Swift Package'den proper macOS .app bundle paketleyici.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

CONFIG="${1:-release}"
APP_NAME="TeslaCam Studio"
BUNDLE_ID="com.local.teslacamstudio"
BUILD_DIR=".build/arm64-apple-macosx/${CONFIG}"
APP_DIR="${BUILD_DIR}/${APP_NAME}.app"

echo "  ⚙  TeslaCamStudio bundle ($CONFIG)"
echo "  ────────────────────────────────────"

# Build
swift build -c "$CONFIG"

BIN_PATH="${BUILD_DIR}/TeslaCamStudio"
if [ ! -f "$BIN_PATH" ]; then
  echo "❌ Binary bulunamadı: $BIN_PATH"
  exit 1
fi

# Bundle yapısı
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Binary
cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/TeslaCamStudio"
chmod +x "$APP_DIR/Contents/MacOS/TeslaCamStudio"

# Info.plist
cat > "$APP_DIR/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>TeslaCamStudio</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
EOF

# Ad-hoc imzala (gatekeeper için)
codesign --force --deep --sign - "$APP_DIR" 2>/dev/null || true

echo "✅ Bundle hazır: $APP_DIR"
echo ""
echo "Başlatmak için: open \"$APP_DIR\""
