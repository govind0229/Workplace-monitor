#!/bin/bash
set -e

# Read the version from .version
if [ ! -f .version ]; then
  echo "Error: .version file not found!"
  exit 1
fi

VERSION=$(cat .version | tr -d '[:space:]')
echo "Bumping all files to version: $VERSION"

# 1. package.json
if [ -f package.json ]; then
  # Use --no-git-tag-version and ignore if the version is already at the target
  npm --no-git-tag-version version "$VERSION" --allow-same-version > /dev/null 2>&1 || true
  echo "✅ Updated package.json"
fi

# 2. public/index.html
if [ -f public/index.html ]; then
  # Replace ?v=old_version with ?v=$VERSION for all occurrences
  sed -i '' -E "s/(\?v=)[0-9\.]+/\1$VERSION/g" public/index.html
  # Update version badge
  sed -i '' -E "s/(<span class=\"version-badge\">v?)[0-9\.]+/\1$VERSION/g" public/index.html
  echo "✅ Updated public/index.html"
fi

# 3. pkg_installer/distribution.xml
if [ -f pkg_installer/distribution.xml ]; then
  # More robust regex for version tag
  sed -i '' -E "s/(version=\")[0-9\.]+(\")/\1$VERSION\2/g" pkg_installer/distribution.xml
  echo "✅ Updated pkg_installer/distribution.xml"
fi

# 4. Info.plist
if [ -f Info.plist ]; then
  # Robust update for CFBundleShortVersionString
  sed -i '' -E "/CFBundleShortVersionString/{n;s/<string>.*<\/string>/<string>$VERSION<\/string>/;}" Info.plist
  # Also sync CFBundleVersion if it exists
  sed -i '' -E "/CFBundleVersion/{n;s/<string>.*<\/string>/<string>$VERSION<\/string>/;}" Info.plist
  echo "✅ Updated Info.plist"
fi

echo ""
echo "All files synced with .version ($VERSION)"
