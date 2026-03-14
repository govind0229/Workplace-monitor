#!/bin/bash

# Kill existing processes more carefully
# We use a unique tag 'workplace-monitor-dev-server' to identify our process
pkill -f "workplace-monitor-dev-server" 2>/dev/null
pkill -f "mac_utility" 2>/dev/null

echo "Starting Working Hours Server..."
# Launch with a unique tag in the arguments so pkill is surgical
node server.js --tag=workplace-monitor-dev-server &
SERVER_PID=$!

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

# Add a trap to kill the server when this script is interrupted
trap "kill $SERVER_PID; exit" INT TERM

wait $SERVER_PID
