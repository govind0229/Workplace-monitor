#!/bin/bash

# Configuration
APP_NAME="WorkingHours.app"
IDENTIFIER="com.user.workinghours"
PLIST_NAME="$IDENTIFIER.plist"

echo "Uninstalling Working Hours..."

# 1. Detect the logged-in user
LOGGED_IN_USER=$(stat -f "%Su" /dev/console)
USER_HOME=$(eval echo ~$LOGGED_IN_USER)
AGENT_DIR="$USER_HOME/Library/LaunchAgents"

# 2. Unload and remove LaunchAgent
if [ -f "$AGENT_DIR/$PLIST_NAME" ]; then
    echo "Unloading LaunchAgent..."
    /bin/launchctl bootout gui/$(id -u "$LOGGED_IN_USER") "$AGENT_DIR/$PLIST_NAME" 2>/dev/null || sudo -u "$LOGGED_IN_USER" launchctl unload "$AGENT_DIR/$PLIST_NAME" 2>/dev/null
    rm "$AGENT_DIR/$PLIST_NAME"
    echo "LaunchAgent removed."
fi

# 3. Kill processes
pkill -f "mac_utility"
pkill -f "node server.js"
echo "Processes stopped."

# 4. Remove App from Applications
if [ -d "/Applications/$APP_NAME" ]; then
    rm -rf "/Applications/$APP_NAME"
    echo "Application removed from /Applications."
fi

# 5. Forget Package
echo "Removing package receipt..."
pkgutil --forget "$IDENTIFIER" 2>/dev/null

echo "Uninstallation complete."
