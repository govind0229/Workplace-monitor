#!/bin/bash

# Kill existing processes
pkill -f "node server.js"
pkill -f "mac_utility"

echo "Starting Working Hours Server..."
node server.js &

echo "Building mac_utility for development..."
swiftc mac_utility.swift -framework WebKit -o mac_utility 2>/dev/null

# Build a minimal .app bundle so macOS grants Location permissions
DEV_APP="dev_build/WorkingHours.app"
rm -rf dev_build
mkdir -p "$DEV_APP/Contents/MacOS"
mkdir -p "$DEV_APP/Contents/Resources"

# Copy Info.plist (contains NSLocationUsageDescription keys)
cp Info.plist "$DEV_APP/Contents/"

# Create a minimal launcher that runs mac_utility from the project directory
PROJ_DIR="$(pwd)"
cat > "$DEV_APP/Contents/MacOS/launcher.sh" << LAUNCHER
#!/bin/bash
cd "$PROJ_DIR"
exec "$PROJ_DIR/mac_utility"
LAUNCHER
chmod +x "$DEV_APP/Contents/MacOS/launcher.sh"

# Ad-hoc sign the dev bundle
codesign --force --deep --sign - "$DEV_APP" 2>/dev/null

echo "Starting macOS Event Monitor (as .app bundle for Location access)..."
open "$DEV_APP"

echo "Both processes started. Check logs above if needed."
wait
