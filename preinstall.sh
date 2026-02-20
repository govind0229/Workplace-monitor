#!/bin/bash

# Pre-install script to stop running WorkingHours processes
# This runs before the app is installed/replaced

APP_NAME="WorkingHours"
INSTALL_PATH="/Applications/${APP_NAME}.app"

echo "Pre-install: Checking for running ${APP_NAME} processes..."

# Kill any running node processes from the app
pkill -f "${INSTALL_PATH}/Contents/Resources/app/node"
pkill -f "${INSTALL_PATH}/Contents/Resources/app/server.js"

# Kill the main app process
pkill -f "${APP_NAME}.app"

# Wait a moment for processes to terminate
sleep 2

# Remove LaunchAgent if it exists (will be re-registered on first launch)
PLIST_PATH="$HOME/Library/LaunchAgents/com.user.workinghours.plist"
if [ -f "$PLIST_PATH" ]; then
    echo "Unloading LaunchAgent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

echo "Pre-install: Cleanup complete"
exit 0
