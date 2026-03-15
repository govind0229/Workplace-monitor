#!/bin/bash

# Get the path of the launcher script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$DIR/../Resources/app"

# Self-Registration of LaunchAgent
PLIST_NAME="com.user.workinghours.plist"
USER_LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
SOURCE_PLIST="$APP_DIR/$PLIST_NAME"
DEST_PLIST="$USER_LAUNCH_AGENTS/$PLIST_NAME"

# Determine the actual app root for plist substitution
# We assume standard structure: AppName.app/Contents/Resources/app -> ../../../ = AppName.app
ACTUAL_APP_ROOT="$(cd "$APP_DIR/../../.." && pwd)"

if [ ! -f "$DEST_PLIST" ]; then
    echo "First run detected. Registering LaunchAgent..." >> "$APP_DIR/server.log"
    mkdir -p "$USER_LAUNCH_AGENTS"
    
    # Copy and update the plist with the actual path
    # We use sed to replace the hardcoded path with the actual installed path
    sed "s|/Applications/WorkingHours.app|$ACTUAL_APP_ROOT|g" "$SOURCE_PLIST" > "$DEST_PLIST"
    
    # Load the agent
    launchctl load "$DEST_PLIST"
    echo "LaunchAgent registered." >> "$APP_DIR/server.log"
fi

cd "$APP_DIR"

# Find Node.js
NODE_PATH=""

# 1. Prefer bundled Node.js (ships inside the .app — works on any Mac)
BUNDLED_NODE="$APP_DIR/node"
if [ -x "$BUNDLED_NODE" ]; then
    NODE_PATH="$BUNDLED_NODE"
fi

# 2. Check if 'node' is in the path (works in Terminal, fails in Finder)
if [ -z "$NODE_PATH" ] && command -v node >/dev/null 2>&1; then
    NODE_PATH=$(command -v node)
fi

# 3. Check NVM
if [ -z "$NODE_PATH" ]; then
    NVM_NODE=$(ls -t "$HOME/.nvm/versions/node/"*/bin/node 2>/dev/null | head -n 1)
    if [ -n "$NVM_NODE" ] && [ -x "$NVM_NODE" ]; then
        NODE_PATH="$NVM_NODE"
    fi
fi

# 4. Check common system locations
if [ -z "$NODE_PATH" ]; then
    if [ -x "/opt/homebrew/bin/node" ]; then
        NODE_PATH="/opt/homebrew/bin/node"
    elif [ -x "/usr/local/bin/node" ]; then
        NODE_PATH="/usr/local/bin/node"
    fi
fi

# 5. Fallback/Error
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js not found." >> "$APP_DIR/server.log"
    osascript -e 'display dialog "WorkingHours requires Node.js to run.\n\nPlease install Node.js from https://nodejs.org and relaunch the app." with title "WorkingHours" buttons {"OK"} default button "OK" with icon stop' 2>/dev/null
    exit 1
fi

echo "Using Node.js at: $NODE_PATH" >> server.log

# Kill any existing server on port 3000 to prevent duplicates
lsof -ti :3000 | xargs kill 2>/dev/null
sleep 0.5

# Start Node.js server
nohup "$NODE_PATH" server.js >> server.log 2>&1 &

# Start Swift Monitor (compiled binary)
./mac_utility
