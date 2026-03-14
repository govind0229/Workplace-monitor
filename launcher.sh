#!/bin/bash

# Get the path of the launcher script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Detect if we are running from project root or inside an .app bundle
if [ -f "$DIR/server.js" ]; then
    APP_DIR="$DIR"
    IS_BUNDLE=false
elif [ -f "$DIR/../Resources/app/server.js" ]; then
    APP_DIR="$DIR/../Resources/app"
    IS_BUNDLE=true
else
    echo "Error: Could not locate app directory."
    exit 1
fi

if [ "$IS_BUNDLE" = true ]; then
    # Self-Registration of LaunchAgent
    PLIST_NAME="com.user.workinghours.plist"
    USER_LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
    SOURCE_PLIST="$APP_DIR/$PLIST_NAME"
    DEST_PLIST="$USER_LAUNCH_AGENTS/$PLIST_NAME"

    # Determine the actual app root for plist substitution
    ACTUAL_APP_ROOT="$(cd "$APP_DIR/../../.." && pwd)"

    if [ ! -f "$DEST_PLIST" ]; then
        echo "First run detected. Registering LaunchAgent..." >> "$APP_DIR/server.log"
        mkdir -p "$USER_LAUNCH_AGENTS"
        
        # Copy and update the plist with the actual path
        sed "s|/Applications/WorkingHours.app|$ACTUAL_APP_ROOT|g" "$SOURCE_PLIST" > "$DEST_PLIST"
        
        # Load the agent
        launchctl load "$DEST_PLIST" 2>/dev/null
        echo "LaunchAgent registered." >> "$APP_DIR/server.log"
    fi
fi

cd "$APP_DIR" || exit 1

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
    echo "Error: Node.js not found." >> server.log
    osascript -e 'display dialog "WorkingHours requires Node.js to run.\n\nPlease install Node.js from https://nodejs.org and relaunch the app." with title "WorkingHours" buttons {"OK"} default button "OK" with icon stop' 2>/dev/null
    exit 1
fi

echo "Using Node.js at: $NODE_PATH" >> server.log

# Kill existing server carefully
pkill -f "workplace-monitor-dev-server" 2>/dev/null
pkill -f "mac_utility" 2>/dev/null
sleep 0.5

# Start Node.js server
nohup "$NODE_PATH" server.js --tag=workplace-monitor-dev-server >> server.log 2>&1 &

# Start Swift Monitor (compiled binary or in-bundle execution)
if [ -x "./mac_utility" ]; then
    ./mac_utility
else
    echo "Warning: mac_utility not found." >> server.log
fi
