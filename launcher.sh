#!/bin/bash

# Get the path of the launcher script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$DIR/../Resources/app"

cd "$APP_DIR"

# Start Node.js server
nohup /usr/local/bin/node server.js > server.log 2>&1 &

# Start Swift Monitor (compiled binary)
./mac_utility
