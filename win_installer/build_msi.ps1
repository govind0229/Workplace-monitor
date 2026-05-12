# Workplace Monitor MSI Build Script
$VERSION = Get-Content .version
$ARCH = $env:ARCH # x64 or arm64

Write-Host "Building Workplace Monitor v$VERSION for Windows ($ARCH)..."

# 1. Setup build directory
$BUILD_DIR = "win_build"
if (Test-Path $BUILD_DIR) { Remove-Item -Recurse -Force $BUILD_DIR }
New-Item -ItemType Directory -Path $BUILD_DIR
New-Item -ItemType Directory -Path "$BUILD_DIR/app"

# 2. Download Node.js for Windows
$NODE_VER = "v20.11.1"
$NODE_URL = "https://nodejs.org/dist/$NODE_VER/win-$ARCH/node.exe"
Write-Host "Downloading Node.js from $NODE_URL..."
Invoke-WebRequest -Uri $NODE_URL -OutFile "$BUILD_DIR/node.exe"

# 3. Publish C# Utility
Write-Host "Publishing C# Native Utility..."
dotnet publish win_utility/WorkMonitor.csproj -c Release -r win-$ARCH --self-contained true -p:PublishSingleFile=true -o "$BUILD_DIR"

# 4. Copy Web Assets and Backend
Write-Host "Collecting web assets..."
Copy-Item -Recurse "public" "$BUILD_DIR/app/"
Copy-Item "server.js" "$BUILD_DIR/app/"
Copy-Item "db.js" "$BUILD_DIR/app/"
Copy-Item "package.json" "$BUILD_DIR/app/"

# Note: In CI, node_modules should be installed for production
# Copy-Item -Recurse "node_modules" "$BUILD_DIR/app/"

# 5. Compile MSI using Wix
Write-Host "Compiling MSI..."
# Heat is used to harvest the 'app' directory into a Wix component group
heat dir "$BUILD_DIR/app" -dr APPFOLDER -ke -sreg -sfrag -cg AppResources -var var.SourceDir -out win_installer/AppFiles.wxs

# Candle compiles the .wxs files
candle win_installer/WorkMonitor.wxs win_installer/AppFiles.wxs -dSourceDir="$BUILD_DIR/app" -o win_installer/

# Light links them into the final MSI
light win_installer/WorkMonitor.wixobj win_installer/AppFiles.wixobj -o "WorkplaceMonitor-$ARCH.msi"

Write-Host "Successfully built WorkplaceMonitor-$ARCH.msi"
