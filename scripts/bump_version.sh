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
  # Use awk/sed or npm version without creating a git tag
  npm --no-git-tag-version version "$VERSION" > /dev/null
  echo "✅ Updated package.json"
fi

# 2. public/index.html
if [ -f public/index.html ]; then
  # Replace ?v=old_version with ?v=$VERSION
  sed -i '' -E "s/href=\"style\.css\?v=[0-9\.]+\"/href=\"style.css?v=$VERSION\"/" public/index.html
  sed -i '' -E "s/src=\"app\.js\?v=[0-9\.]+\"/src=\"app.js?v=$VERSION\"/" public/index.html
  sed -i '' -E "s/<span class=\"version-badge\">v[0-9\.]+<\/span>/<span class=\"version-badge\">v$VERSION<\/span>/" public/index.html
  echo "✅ Updated public/index.html"
fi

# 3. pkg_installer/distribution.xml
if [ -f pkg_installer/distribution.xml ]; then
  sed -i '' -E "s/<pkg-ref id=\"com\.user\.workinghours\.pkg\"[ ]*version=\"[0-9\.]+\"/<pkg-ref id=\"com.user.workinghours.pkg\" version=\"$VERSION\"/" pkg_installer/distribution.xml
  echo "✅ Updated pkg_installer/distribution.xml"
fi

# 4. Info.plist
if [ -f Info.plist ]; then
  sed -i '' -e "/<key>CFBundleShortVersionString<\/key>/{n;s/<string>.*<\/string>/<string>$VERSION<\/string>/;}" Info.plist
  echo "✅ Updated Info.plist"
fi

echo ""
echo "All files synced with .version ($VERSION)"
