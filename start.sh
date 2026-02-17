#!/bin/bash

# Kill existing processes
pkill -f "node server.js"
pkill -f "swift mac_utility.swift"

echo "Starting Working Hours Server..."
node server.js &

echo "Starting macOS Event Monitor (mac_utility.swift)..."
swift mac_utility.swift &

echo "Both processes started. Check logs above if needed."
wait
