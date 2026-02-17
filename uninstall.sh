#!/bin/bash

# Configuration
APP_NAME="WorkingHours.app"
PLIST_NAME="com.user.workinghours.plist"

echo "Stopping Working Hours..."

# 1. Unload and remove LaunchAgent
if [ -f "$HOME/Library/LaunchAgents/$PLIST_NAME" ]; then
    launchctl unload "$HOME/Library/LaunchAgents/$PLIST_NAME" 2>/dev/null
    rm "$HOME/Library/LaunchAgents/$PLIST_NAME"
    echo "LaunchAgent removed."
fi

# 2. Kill processes
pkill -f "mac_utility"
pkill -f "node server.js"
echo "Processes stopped."

# 3. Remove App from Applications
if [ -d "/Applications/$APP_NAME" ]; then
    rm -rf "/Applications/$APP_NAME"
    echo "Application removed from /Applications."
fi

echo "Uninstallation complete."
