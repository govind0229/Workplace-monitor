#!/bin/bash

# Configuration
APP_NAME="WorkingHours"
IDENTIFIER="com.user.workinghours"
VERSION="1.0.0"
INSTALL_LOCATION="/Applications"

echo "Building $APP_NAME.pkg..."

# 1. Compile Swift Monitor
echo "Compiling mac_utility.swift..."
swiftc mac_utility.swift -o mac_utility

# 2. Generate App Icon
if [ -f "icon.png" ]; then
    echo "Generating AppIcon.icns..."
    mkdir -p AppIcon.iconset
    for size in 16 32 128 256 512; do
        sips -z $size $size icon.png --setProperty format png --out AppIcon.iconset/icon_${size}x${size}.png
        double_size=$((size * 2))
        sips -z $double_size $double_size icon.png --setProperty format png --out AppIcon.iconset/icon_${size}x${size}@2x.png
    done
    iconutil -c icns AppIcon.iconset
    rm -rf AppIcon.iconset
fi

# 3. Create the .app bundle structure
echo "Creating .app bundle structure..."
rm -rf "$APP_NAME.app"
mkdir -p "$APP_NAME.app/Contents/MacOS"
mkdir -p "$APP_NAME.app/Contents/Resources"
mkdir -p "$APP_NAME.app/Contents/Resources/app"

# 4. Copy files to the bundle
cp Info.plist "$APP_NAME.app/Contents/"
if [ -f "AppIcon.icns" ]; then
    cp AppIcon.icns "$APP_NAME.app/Contents/Resources/"
fi

cp launcher.sh "$APP_NAME.app/Contents/MacOS/"
chmod +x "$APP_NAME.app/Contents/MacOS/launcher.sh"

cp mac_utility "$APP_NAME.app/Contents/Resources/app/"
cp server.js "$APP_NAME.app/Contents/Resources/app/"
cp db.js "$APP_NAME.app/Contents/Resources/app/"
cp com.user.workinghours.plist "$APP_NAME.app/Contents/Resources/app/"
cp -R public "$APP_NAME.app/Contents/Resources/app/"
cp -R node_modules "$APP_NAME.app/Contents/Resources/app/"

# 4. Prepare Scripts
mkdir -p scripts
cp postinstall.sh scripts/postinstall
chmod +x scripts/postinstall

# 5. Build the package
echo "Building final .pkg..."
pkgbuild --identifier "$IDENTIFIER" \
         --version "$VERSION" \
         --install-location "$INSTALL_LOCATION" \
         --root "$APP_NAME.app" \
         --scripts scripts \
         "$APP_NAME.pkg"

echo "Package built: $APP_NAME.pkg"
