#!/bin/bash

# Configuration
APP_NAME="WorkingHours"
DMG_NAME="${APP_NAME}"
DMG_VOLUME_NAME="Install ${APP_NAME}"
VERSION="1.2.0"

echo "=== Building ${APP_NAME} DMG Installer ==="

# 1. Build the .app using shared build script
echo "Step 1: Building .app bundle..."
bash build_app.sh dmg_staging

# 2. Create DMG staging area with Applications symlink
echo "Step 2: Preparing DMG contents..."
ln -sf /Applications "dmg_staging/Applications"

# 3. Create a background image with instructions
echo "Step 3: Creating DMG background..."
mkdir -p "dmg_staging/.background"

# Generate a simple background image using Python
python3 -c "
import struct, zlib

def create_png(width, height, bg_color, text_lines):
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    # Create image data
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter none
        for x in range(width):
            raw += bytes(bg_color)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', zlib.compress(raw))
    png += chunk(b'IEND', b'')
    return png

# White background
png_data = create_png(400, 240, (255, 255, 255), [])
with open('dmg_staging/.background/bg.png', 'wb') as f:
    f.write(png_data)
" 2>/dev/null

# 4. Create temporary DMG
echo "Step 4: Creating DMG..."
rm -f "${DMG_NAME}.dmg" "${DMG_NAME}-temp.dmg"

# Create a temporary read-write DMG
hdiutil create -srcfolder "dmg_staging" \
    -volname "${DMG_VOLUME_NAME}" \
    -fs HFS+ \
    -fsargs "-c c=64,a=16,e=16" \
    -format UDRW \
    -size 200m \
    "${DMG_NAME}-temp.dmg"

# 5. Mount and customize the DMG layout
echo "Step 5: Customizing DMG layout..."
MOUNT_DIR=$(hdiutil attach -readwrite -noverify -noautoopen "${DMG_NAME}-temp.dmg" | grep "/Volumes/" | sed 's/.*\/Volumes/\/Volumes/')

if [ -n "$MOUNT_DIR" ]; then
    # Use AppleScript to set the DMG window appearance
    osascript <<EOF
    tell application "Finder"
        tell disk "${DMG_VOLUME_NAME}"
            open
            delay 1
            set current view of container window to icon view
            set toolbar visible of container window to false
            set statusbar visible of container window to false
            set the bounds of container window to {400, 200, 800, 440}
            set theViewOptions to the icon view options of container window
            set arrangement of theViewOptions to not arranged
            set icon size of theViewOptions to 72
            try
                set background picture of theViewOptions to file ".background:bg.png"
            end try
            delay 1
            set position of item "${APP_NAME}.app" of container window to {100, 120}
            set position of item "Applications" of container window to {300, 120}
            close
            open
            update without registering applications
            delay 2
            close
        end tell
    end tell
EOF

    # Set custom volume icon if available
    if [ -f "AppIcon.icns" ]; then
        cp AppIcon.icns "${MOUNT_DIR}/.VolumeIcon.icns"
        SetFile -c icnC "${MOUNT_DIR}/.VolumeIcon.icns" 2>/dev/null
        SetFile -a C "${MOUNT_DIR}" 2>/dev/null
    fi

    sync
    hdiutil detach "$MOUNT_DIR"
fi

# 6. Convert to compressed read-only DMG
echo "Step 6: Compressing DMG..."
hdiutil convert "${DMG_NAME}-temp.dmg" \
    -format UDZO \
    -imagekey zlib-level=9 \
    -o "${DMG_NAME}.dmg"

rm -f "${DMG_NAME}-temp.dmg"

# 7. Clean up staging
rm -rf "dmg_staging"

echo ""
echo "=== DMG Installer Created ==="
echo "  File: ${DMG_NAME}.dmg"
echo "  Size: $(du -h "${DMG_NAME}.dmg" | cut -f1)"
echo ""
echo "Users can double-click the DMG and drag ${APP_NAME}.app to Applications."
