#!/bin/bash

# Configuration
IDENTIFIER="com.user.workinghours"
PLIST_NAME="$IDENTIFIER.plist"
APP_DIR="/Applications/WorkingHours.app"
AGENT_DIR="$HOME/Library/LaunchAgents"

echo "Running postinstall script..."

# 1. Detect the logged-in user
LOGGED_IN_USER=$(stat -f "%Su" /dev/console)
USER_HOME=$(eval echo ~$LOGGED_IN_USER)
AGENT_DIR="$USER_HOME/Library/LaunchAgents"

echo "Running postinstall script for user: $LOGGED_IN_USER"

# 2. Ensure LaunchAgents directory exists
mkdir -p "$AGENT_DIR"
chown "$LOGGED_IN_USER" "$AGENT_DIR"

# 3. Copy PLIST to LaunchAgents
cp "$APP_DIR/Contents/Resources/app/$PLIST_NAME" "$AGENT_DIR/"
chown "$LOGGED_IN_USER" "$AGENT_DIR/$PLIST_NAME"

# 4. Load the LaunchAgent as the user
sudo -u "$LOGGED_IN_USER" launchctl load "$AGENT_DIR/$PLIST_NAME"

echo "LaunchAgent loaded. Working Hours will start automatically."
