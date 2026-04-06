#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# build_distribution_pkg.sh — Build a distribution .pkg using
# productbuild + distribution.xml for a polished installer UI
#
# Run build_pkg.sh first to create the component .pkg, then:
#   bash build_distribution_pkg.sh
# ──────────────────────────────────────────────────────────────

APP_NAME="${APP_NAME:-WorkplaceMonitor}"
IDENTIFIER="${IDENTIFIER:-com.workplacemonitor.app}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION="${VERSION:-$(cat "$REPO_ROOT/.version")}"
COMPONENT_PKG="$REPO_ROOT/${APP_NAME}.pkg"
DIST_PKG="$REPO_ROOT/${APP_NAME}-Installer.pkg"

if [ ! -f "$COMPONENT_PKG" ]; then
    echo "Error: Component package not found at $COMPONENT_PKG"
    echo "Run build_pkg.sh first."
    exit 1
fi

echo "Building distribution package with productbuild..."

# Rename component .pkg for distribution.xml reference
cp "$COMPONENT_PKG" "$SCRIPT_DIR/${APP_NAME}-component.pkg"

productbuild \
    --distribution "$SCRIPT_DIR/distribution.xml" \
    --package-path "$SCRIPT_DIR" \
    --version "$VERSION" \
    "$DIST_PKG"

# Clean up temporary component copy
rm -f "$SCRIPT_DIR/${APP_NAME}-component.pkg"

# Optional: sign the distribution package
if [ -n "${APPLE_INSTALLER_CERT:-}" ]; then
    echo "Signing distribution package..."
    SIGNED="$REPO_ROOT/${APP_NAME}-Installer-signed.pkg"
    productsign --sign "$APPLE_INSTALLER_CERT" "$DIST_PKG" "$SIGNED"
    mv "$SIGNED" "$DIST_PKG"
fi

echo ""
echo "✅  Distribution package: $DIST_PKG"
echo "📏  Size: $(du -h "$DIST_PKG" | cut -f1)"

if [ -f $DIST_PKG ]; then 
    mv $DIST_PKG $REPO_ROOT/WorkplaceMonitor.pkg
fi
