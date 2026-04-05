#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# build_pkg.sh — Build a macOS .pkg installer for YourApp
#
# Usage:
#   bash build_pkg.sh                     # defaults
#   VERSION=2.0.0 bash build_pkg.sh       # override version
#   APPLE_CERT_USER="Developer ID Installer: ..." bash build_pkg.sh  # sign
#
# Requirements: macOS with pkgbuild, productbuild, swiftc, iconutil
# ──────────────────────────────────────────────────────────────

# ── Configuration (override via environment) ─────────────────
APP_NAME="${APP_NAME:-WorkingHours}"
IDENTIFIER="${IDENTIFIER:-com.user.workinghours}"
INSTALL_LOCATION="/Applications"

# Directories (relative to repo root)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Global Version read from .version file
VERSION="${VERSION:-$(cat "$REPO_ROOT/.version")}"
BUILD_DIR="$SCRIPT_DIR/_build"
ROOT_DIR="$BUILD_DIR/root"            # payload for pkgbuild --root
SCRIPTS_DIR="$BUILD_DIR/scripts"      # pre/post-install scripts
PKG_OUTPUT="$REPO_ROOT/${APP_NAME}.pkg"

echo "═══════════════════════════════════════════════════"
echo "  Building ${APP_NAME}.pkg  (v${VERSION})"
echo "  Identifier : ${IDENTIFIER}"
echo "═══════════════════════════════════════════════════"

# ── 0. Clean previous build artifacts ────────────────────────
echo ""
echo "[1/7] Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$ROOT_DIR" "$SCRIPTS_DIR"

# ── 1. Compile Swift binary ──────────────────────────────────
echo "[2/7] Compiling mac_utility.swift..."
swiftc "$REPO_ROOT/mac_utility.swift" -framework WebKit -o "$REPO_ROOT/mac_utility"

# ── 2. Generate App Icon ─────────────────────────────────────
if [ -f "$REPO_ROOT/icon.png" ]; then
    echo "[3/7] Generating AppIcon.icns..."
    ICONSET="$BUILD_DIR/AppIcon.iconset"
    mkdir -p "$ICONSET"
    for size in 16 32 128 256 512; do
        sips -z $size $size "$REPO_ROOT/icon.png" \
            --setProperty format png \
            --out "$ICONSET/icon_${size}x${size}.png" 2>/dev/null
        double=$((size * 2))
        sips -z $double $double "$REPO_ROOT/icon.png" \
            --setProperty format png \
            --out "$ICONSET/icon_${size}x${size}@2x.png" 2>/dev/null
    done
    iconutil -c icns "$ICONSET" -o "$REPO_ROOT/AppIcon.icns"
    rm -rf "$ICONSET"
else
    echo "[3/7] Skipping icon generation (icon.png not found)"
fi

# ── 3. Create .app bundle inside root/ ───────────────────────
echo "[4/7] Assembling .app bundle..."
APP_BUNDLE="$ROOT_DIR/${APP_NAME}.app"
CONTENTS="$APP_BUNDLE/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
APP_RES="$RESOURCES/app"

mkdir -p "$MACOS" "$RESOURCES" "$APP_RES"

# Info.plist
cp "$REPO_ROOT/Info.plist" "$CONTENTS/"

# Icon
[ -f "$REPO_ROOT/AppIcon.icns" ] && cp "$REPO_ROOT/AppIcon.icns" "$RESOURCES/"

# Main executable
cp "$REPO_ROOT/mac_utility" "$MACOS/"
chmod +x "$MACOS/mac_utility"

# Application files
cp "$REPO_ROOT/server.js"  "$APP_RES/"
cp "$REPO_ROOT/db.js"      "$APP_RES/"
cp "$REPO_ROOT/package.json" "$APP_RES/"
cp "$REPO_ROOT/com.user.workinghours.plist" "$APP_RES/"
cp -R "$REPO_ROOT/public"       "$APP_RES/"
cp -R "$REPO_ROOT/node_modules" "$APP_RES/"

# Bundled Node.js
if [ -f "$REPO_ROOT/bundled_node/node" ]; then
    cp "$REPO_ROOT/bundled_node/node" "$APP_RES/node"
    chmod +x "$APP_RES/node"
else
    echo "  ⚠  bundled_node/node not found — run download_node.sh first"
fi

# Ad-hoc code sign (or real sign if cert provided)
if [ -n "${APPLE_CERT_USER:-}" ]; then
    echo "  Signing with: $APPLE_CERT_USER"
    codesign --force --deep --options runtime --timestamp \
        --sign "$APPLE_CERT_USER" "$APP_BUNDLE"
else
    echo "  Ad-hoc signing (local development)"
    codesign --force --deep --sign - "$APP_BUNDLE"
fi

# ── 4. Prepare installer scripts ─────────────────────────────
echo "[5/7] Preparing installer scripts..."

# --- preinstall ---
cat > "$SCRIPTS_DIR/preinstall" << 'PREINSTALL_EOF'
#!/bin/bash
# preinstall — Stops running app processes before replacing the bundle

APP_NAME="WorkingHours"
APP_PATH="/Applications/${APP_NAME}.app"

echo "[preinstall] Stopping running ${APP_NAME} processes..."

pkill -f "${APP_PATH}/Contents/Resources/app/node"   2>/dev/null || true
pkill -f "${APP_PATH}/Contents/Resources/app/server"  2>/dev/null || true
pkill -f "${APP_NAME}.app"                             2>/dev/null || true

sleep 2

# Unload LaunchAgent if present
LOGGED_IN_USER=$(stat -f "%Su" /dev/console)
USER_HOME=$(eval echo ~"$LOGGED_IN_USER")
PLIST="$USER_HOME/Library/LaunchAgents/com.user.workinghours.plist"
if [ -f "$PLIST" ]; then
    echo "[preinstall] Unloading LaunchAgent..."
    sudo -u "$LOGGED_IN_USER" launchctl unload "$PLIST" 2>/dev/null || true
fi

echo "[preinstall] Done."
exit 0
PREINSTALL_EOF

# --- postinstall ---
cat > "$SCRIPTS_DIR/postinstall" << 'POSTINSTALL_EOF'
#!/bin/bash
# postinstall — Removes quarantine, fixes permissions, loads LaunchAgent

APP_NAME="WorkingHours"
APP_PATH="/Applications/${APP_NAME}.app"
IDENTIFIER="com.user.workinghours"
PLIST_NAME="${IDENTIFIER}.plist"

echo "[postinstall] Configuring ${APP_NAME}..."

# 1. Remove macOS quarantine attribute
echo "[postinstall] Removing quarantine attribute..."
xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null || true

# 2. Set correct permissions on the bundle
echo "[postinstall] Setting permissions..."
chmod -R 755 "$APP_PATH"
chown -R root:wheel "$APP_PATH"

# Make executables explicitly executable
chmod +x "$APP_PATH/Contents/MacOS/mac_utility"  2>/dev/null || true
chmod +x "$APP_PATH/Contents/Resources/app/node" 2>/dev/null || true

# 3. Detect logged-in user for LaunchAgent
LOGGED_IN_USER=$(stat -f "%Su" /dev/console)
USER_HOME=$(eval echo ~"$LOGGED_IN_USER")
AGENT_DIR="$USER_HOME/Library/LaunchAgents"

# 4. Install and load LaunchAgent
mkdir -p "$AGENT_DIR"
chown "$LOGGED_IN_USER" "$AGENT_DIR"

if [ -f "$APP_PATH/Contents/Resources/app/$PLIST_NAME" ]; then
    cp "$APP_PATH/Contents/Resources/app/$PLIST_NAME" "$AGENT_DIR/"
    chown "$LOGGED_IN_USER" "$AGENT_DIR/$PLIST_NAME"
    sudo -u "$LOGGED_IN_USER" launchctl load "$AGENT_DIR/$PLIST_NAME" 2>/dev/null || true
    echo "[postinstall] LaunchAgent loaded."
fi

echo "[postinstall] Installation complete. ${APP_NAME} will start automatically."
exit 0
POSTINSTALL_EOF

chmod +x "$SCRIPTS_DIR/preinstall"
chmod +x "$SCRIPTS_DIR/postinstall"

# ── 5. Build .pkg with pkgbuild ──────────────────────────────
echo "[6/7] Building .pkg with pkgbuild..."
pkgbuild \
    --identifier "$IDENTIFIER" \
    --version "$VERSION" \
    --install-location "$INSTALL_LOCATION" \
    --root "$ROOT_DIR" \
    --scripts "$SCRIPTS_DIR" \
    --ownership recommended \
    "$PKG_OUTPUT"

# ── 6. (Optional) Sign the .pkg ──────────────────────────────
if [ -n "${APPLE_INSTALLER_CERT:-}" ]; then
    echo "[7/7] Signing .pkg with: $APPLE_INSTALLER_CERT"
    SIGNED_PKG="$REPO_ROOT/${APP_NAME}-signed.pkg"
    productsign --sign "$APPLE_INSTALLER_CERT" "$PKG_OUTPUT" "$SIGNED_PKG"
    mv "$SIGNED_PKG" "$PKG_OUTPUT"
else
    echo "[7/7] Skipping .pkg signing (set APPLE_INSTALLER_CERT to enable)"
fi

# ── 7. Clean up build directory ──────────────────────────────
rm -rf "$BUILD_DIR"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅  Package built successfully!"
echo "  📦  ${PKG_OUTPUT}"
echo "  📏  Size: $(du -h "$PKG_OUTPUT" | cut -f1)"
echo "═══════════════════════════════════════════════════"
