#!/bin/bash

# Downloads a portable Node.js binary for bundling inside the .app
# Supports both Apple Silicon (arm64) and Intel (x64) Macs

# Auto-detect version from system Node (ensures native modules are compatible)
if command -v node >/dev/null 2>&1; then
    NODE_VERSION="$(node --version)"
else
    NODE_VERSION="v24.11.1"
fi
OUTPUT_DIR="${1:-.}"

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    PLATFORM="darwin-arm64"
else
    PLATFORM="darwin-x64"
fi

TARBALL="node-${NODE_VERSION}-${PLATFORM}.tar.gz"
URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
NODE_DIR="node-${NODE_VERSION}-${PLATFORM}"

echo "Downloading Node.js ${NODE_VERSION} for ${PLATFORM}..."

# Download if not already cached
if [ ! -f "$TARBALL" ]; then
    curl -fSL -o "$TARBALL" "$URL"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to download Node.js from $URL"
        exit 1
    fi
fi

# Extract just the node binary
echo "Extracting node binary..."
tar -xzf "$TARBALL" "${NODE_DIR}/bin/node"

# Copy to output
mkdir -p "$OUTPUT_DIR"
cp "${NODE_DIR}/bin/node" "$OUTPUT_DIR/node"
chmod +x "$OUTPUT_DIR/node"

# Cleanup
rm -rf "$NODE_DIR"

echo "Node.js binary saved to: $OUTPUT_DIR/node"
"$OUTPUT_DIR/node" --version
