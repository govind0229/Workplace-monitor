#!/bin/bash

# Configuration
APP_NAME="WorkingHours"
IDENTIFIER="com.user.workinghours"
VERSION="${VERSION:-1.2.2}"

# Allow custom output directory (used by build_dmg.sh)
OUTPUT_DIR="${1:-payload}"

echo "Building $APP_NAME.app..."

# 1. Compile Swift Monitor
echo "  Compiling mac_utility.swift..."
swiftc mac_utility.swift -framework WebKit -o mac_utility

# 2. Generate App Icon
if [ -f "icon.png" ]; then
    echo "  Generating AppIcon.icns..."
    mkdir -p AppIcon.iconset
    for size in 16 32 128 256 512; do
        sips -z $size $size icon.png --setProperty format png --out AppIcon.iconset/icon_${size}x${size}.png 2>/dev/null
        double_size=$((size * 2))
        sips -z $double_size $double_size icon.png --setProperty format png --out AppIcon.iconset/icon_${size}x${size}@2x.png 2>/dev/null
    done
    iconutil -c icns AppIcon.iconset
    rm -rf AppIcon.iconset
fi

# 3. Create the .app bundle structure
echo "  Creating .app bundle structure..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/$APP_NAME.app/Contents/MacOS"
mkdir -p "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources"
mkdir -p "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app"

# 4. Bundle portable Node.js binary
echo "  Bundling Node.js..."
if [ -f "bundled_node/node" ]; then
    echo "    Using cached bundled_node/node"
else
    bash download_node.sh ./bundled_node
fi

# 5. Copy files to the bundle
cp Info.plist "$OUTPUT_DIR/$APP_NAME.app/Contents/"
[ -f "AppIcon.icns" ] && cp AppIcon.icns "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/"

cp launcher.sh "$OUTPUT_DIR/$APP_NAME.app/Contents/MacOS/"
chmod +x "$OUTPUT_DIR/$APP_NAME.app/Contents/MacOS/launcher.sh"

cp mac_utility "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp server.js "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp db.js "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp package.json "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp com.user.workinghours.plist "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp -R public "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp -R node_modules "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/"
cp bundled_node/node "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/node"
chmod +x "$OUTPUT_DIR/$APP_NAME.app/Contents/Resources/app/node"

# 5. Ad-hoc sign the app (prevents some permission issues)
codesign --force --deep --sign - "$OUTPUT_DIR/$APP_NAME.app"

# 6. Zip the app (only when using default output dir)
if [ "$OUTPUT_DIR" = "payload" ]; then
    echo "  Zipping .app..."
    cd "$OUTPUT_DIR"
    zip -r "../$APP_NAME.zip" "$APP_NAME.app"
    cd ..
    echo "App built: $APP_NAME.zip"
else
    echo "  .app bundle created in $OUTPUT_DIR/"
fi
