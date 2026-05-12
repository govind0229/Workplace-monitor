#!/bin/bash

# Kill existing processes
pkill -f "node server.js"
pkill -f "mac_utility"

echo "Building mac_utility for development..."
swiftc mac_utility.swift -framework WebKit -o mac_utility 2>/dev/null

# Build a minimal .app bundle so macOS grants Location permissions
DEV_APP="dev_build/WorkingHours.app"
rm -rf dev_build
mkdir -p "$DEV_APP/Contents/MacOS"
mkdir -p "$DEV_APP/Contents/Resources"

# Copy Info.plist (contains NSLocationUsageDescription keys)
cp Info.plist "$DEV_APP/Contents/"

# Copy the binary directly into the bundle
cp mac_utility "$DEV_APP/Contents/MacOS/"

# CRITICAL: Link local project files into the bundle so mac_utility serves them
# This ensures local changes are used during development
mkdir -p "$DEV_APP/Contents/Resources/app"
ln -s "$PWD/public" "$DEV_APP/Contents/Resources/app/public"
ln -s "$PWD/server.js" "$DEV_APP/Contents/Resources/app/server.js"
ln -s "$PWD/db.js" "$DEV_APP/Contents/Resources/app/db.js"
ln -s "$PWD/package.json" "$DEV_APP/Contents/Resources/app/package.json"
ln -s "$PWD/node_modules" "$DEV_APP/Contents/Resources/app/node_modules"
ln -s "$PWD/node" "$DEV_APP/Contents/Resources/app/node"

# The Info.plist now correctly points to mac_utility as the executable
# So we don't need the launcher.sh script anymore.

# Ad-hoc sign the dev bundle
codesign --force --deep --sign - "$DEV_APP" 2>/dev/null

echo "Starting macOS Event Monitor ($DEV_APP)..."
open "$DEV_APP"

echo "Both processes started. Check logs above if needed."

wait
