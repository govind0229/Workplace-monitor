# Changelog

All notable changes to WorkplaceMonitor will be documented in this file.

## [1.2.0] - 2026-02-18

### Added
- **Idle Detection** — Auto-pause tracking after 5 minutes of no mouse/keyboard activity (CGEventSource)
- **CSV Export** — Download daily, weekly, and monthly reports from History view
- **App Categories + Pie Chart** — SVG donut chart grouping apps into 8 categories (Development, Browsers, Communication, Productivity, Media, Design, System, Other)
- **Break Reminders** — Configurable periodic notifications during continuous work sessions
- **Light/Dark Mode Toggle** — Full theme switch in Settings, persisted to localStorage
- **Bundled Node.js** — Portable Node.js binary embedded in .app for zero-dependency distribution
- **DMG Installer** — `build_dmg.sh` creates a drag-and-drop macOS installer
- **Docker Support** — Dockerfile and docker-compose.yml for containerized deployment
- **Security** — XSS prevention via input sanitization, localhost-only server binding
- **LaunchAgent Self-Registration** — Auto-start on login via `com.user.workinghours.plist`

### Changed
- Updated `launcher.sh` with multi-source Node.js discovery (bundled → PATH → NVM → Homebrew)
- Improved `mac_utility.swift` with idle time monitoring via `CGEventSource`
- Enhanced `server.js` with category mapping, CSV export endpoints, break reminder settings
- Redesigned `public/app.js` with pie chart rendering, CSV download, theme toggle, idle status display
- Updated `public/style.css` with dark mode variables and category color scheme
- Updated `public/index.html` with new Settings panel and History export controls

## [1.0.0] - 2026-02-15

### Added
- Initial release
- Active application tracking via Swift (`NSWorkspace`)
- Node.js + Express web dashboard on `localhost:3000`
- SQLite database for persistent session storage
- Daily, weekly, and monthly history views
- macOS `.app` bundle build script (`build_app.sh`)
- macOS `.pkg` installer build script (`build_pkg.sh`)
- LaunchAgent plist for auto-start
- Uninstall script
