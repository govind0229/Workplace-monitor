# Changelog

All notable changes to WorkplaceMonitor will be documented in this file.

## [1.3.2] - 2026-03-13

### Added
- **Premium Location Page Design** — New immersive split-screen layout with high-end glassmorphic controls and centered panels.
- **Interactive Radius Gauge** — Dynamic SVG-based gauge that provides real-time visual feedback for the geofence boundary.
- **Custom Precision Slider** — Bespoke range slider with interactive -/+ buttons for precise radius adjustments.
- **Map Type Switcher** — New floating control to toggle between Dark Matter, Positron, Street, and Satellite map styles (Street view now default).
- **High-Fidelity Office Marker** — Premium custom purple pin with a pulsing base glow and professional HUD-style location labels.
- **Refined Geofence Visuals** — Dual-circle geofences with high-contrast borders for better definition against dark and satellite maps.
- **Geofence Auto-Save** — Geofence radius changes are now automatically synchronized with the server via debounced auto-save logic.

### Fixed
- **Location Permission Prompts** — Fixed an issue where the app would stop asking for location permissions; the request is now triggered proactively on page load.

## [1.3.1] - 2026-03-12

### Added
- **Native macOS Notifications** — Goal completion alerts now use native macOS `UserNotifications` for a premium system experience, including standard banner styles, system sounds, and Notification Center persistence.
- **Notification Permissions** — The app now properly requests user permission for notifications upon first launch.

### Changed
- **Enhanced Status API** — The backend `/status` endpoint now exposes goal settings and notification state to the native Swift utility.
- **Unified Notification Logic** — Moved notification triggers from Node.js to Swift to ensure native appearance and behavior.

## [1.3.0] - 2026-03-06

### Added
- **GPS Location Automation** — Automatically start the Workplace timer when arriving at the office and finish it when leaving, using native macOS `CoreLocation` geofencing.
- **Interactive Map View** — New dedicated "Location" page in the sidebar with a Leaflet-powered interactive map showing the office geofence radius and your current position.
- **Set Office Location** — One-click button to capture your current GPS coordinates as the office location using the browser's Geolocation API.
- **Configurable Geofence Radius** — Adjustable radius (50–2000m) for defining the office boundary.
- **Clear Office Location** — Button to disable location automation and clear saved coordinates.
- **Stale Session Recovery** — Server automatically completes orphaned manual sessions on startup if they've been idle for more than 30 minutes (safety net for missed location updates).
- **Location Info Cards** — Dashboard cards showing Office Coordinates, Geofence Radius, and monitoring Status.
- **README Screenshots** — Added screenshots of Dashboard, Location, History, and Settings views.

### Changed
- **start.sh Rewrite** — Development script now builds a minimal `.app` bundle so macOS properly grants Location permissions during development.
- **kill_server.sh** — Now also terminates the dev `.app` bundle and `mac_utility` processes.
- **Info.plist** — Added `NSLocationAlwaysUsageDescription`, `NSLocationWhenInUseUsageDescription`, and `NSLocationAlwaysAndWhenInUseUsageDescription` keys.
- **Database Migrations** — Added automatic column migrations for `type`, `notified`, and `last_break_notify` in the sessions table to support older databases.
- **Timer Completion** — Office timer now properly finishes (completes the session) instead of pausing when leaving the geofence.

## [1.2.3] - 2026-03-01

### Added
- **Mac Widget Dynamic Icons** — The macOS menu bar widget now dynamically displays an outline of the office icon and workplace timer when working in the office, and automatically switches back to the home icon and daily timer otherwise.
- **Dynamic Session Icons** — The active tracking logo now visually switches between "Office" and "Home" (WFH) depending on whether the manual session is running.
- **Combined Daily Chart Label** — The top label of the "Last 7 Days" chart columns now shows the combined total duration of both Workplace and WFH hours instead of just the higher of the two.

### Changed
- **WFH Priority** — Automatically pausing the background "WFH" tracker while a manual "Workplace" session is actively running so both timers don't overlap simultaneously.
- **Terminology Updates** — Renamed all user-facing instances of "Day Working" and "Day Total" to "WFH" (Work From Home) for clearer distinction.
- **Simplified Chart Legends** — Removed unnecessary color dots from the "Last 7 Days" chart legend and removed the goal dot helper icon for a cleaner interface.

## [1.2.2] - 2026-02-20

### Added
- **New Accent Colors** — Added three stunning new high-contrast accent colors specifically tailored for Light Theme: Indigo, Teal, and Coral.
- **Dynamic Structural Colors** — Re-engineered `app.js` to intelligently compute proper rgba overlays and shadows dynamically based on the chosen Accent Color.
- **Cache Invalidations** — Added logic to forcefully purge Apple's `WKWebsiteDataStore` disk caching, ensuring CSS style updates are immediately seen on launch.
- Added Gatekeeper troubleshooting instructions for Gatekeeper quarantine flag (`xattr -cr`) bypass.

### Fixed
- **Light Theme Color Bleed** — Fixed an issue where the Light Theme forcefully overrode custom accent colors with static visual purple.
- **Invisible Color Swatches** — Fixed an issue where the color selection swatches in the Settings menu rendered visually invisible as default white pills in WKWebView due to missing CSS classes.

## [1.2.1] - 2026-02-19

### Chart & Visual Enhancements
- **Goal Reference Line** — Added a visual reference line for daily goals on the weekly chart
- **Interactive Tooltips** — Added detailed hover tooltips, removing cluttered static values
- **Improved Readability** — Increased overall chart height and explicitly centered data only when present
- **Current Day Highlight** — Added distinct visual highlighting for the current day's column

### Performance Optimizations
- **CSS Performance** — Added GPU acceleration with `transform: translateZ(0)` and `will-change` properties for animated elements
- **Smooth Animations** — Replaced `setInterval` with `requestAnimationFrame` for 60fps timer updates
- **Reduced Reflows** — Batched all DOM updates using `requestAnimationFrame` to minimize layout thrashing
- **Smart Caching** — Implemented 30-second chart data cache to reduce redundant API calls
- **Debouncing** — Added debounce/throttle utilities for window focus and visibility events
- **Efficient DOM Updates** — Used `DocumentFragment` for bulk insertions in reports and app usage lists
- **DOM Caching** — Cached frequently accessed elements to reduce querySelector calls
- **Paint Optimization** — Added `contain: layout style paint` for better rendering performance

### Responsive Design
- **Mobile Support** — Fully responsive layout for tablets (≤1024px), mobile (≤768px), and small screens (≤480px)
- **Adaptive Sidebar** — Horizontal navigation bar on mobile devices
- **Touch Optimization** — Enhanced scrolling with `-webkit-overflow-scrolling: touch`
- **Flexible Layouts** — Single-column grids and full-width buttons on smaller screens

### User Experience
- **Smooth Scrolling** — Added `scroll-behavior: smooth` for better navigation
- **Online/Offline Detection** — Visual feedback when connection is lost or restored
- **Button Feedback** — Disabled state and loading text during save operations
- **Accessibility** — Added `prefers-reduced-motion` support for users with motion sensitivity
- **Better Transitions** — Standardized transition durations with CSS custom properties

### Code Quality
- **Error Handling** — Improved error messages with user-friendly fallbacks
- **Memory Management** — Proper cleanup of animation frames on page unload
- **Security** — Enhanced HTML escaping for all user-generated content
- **Performance Monitoring** — Throttled display updates to maintain 60fps

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
