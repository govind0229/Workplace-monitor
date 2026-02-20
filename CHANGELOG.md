# Changelog

All notable changes to WorkplaceMonitor will be documented in this file.

## [1.3.0] - 2026-02-20

### Enterprise Transformation (Phase 1)
- **Centralized Cloud Backend** — Created foundation for multi-tenant data syncing via PostgreSQL schema (`enterprise-backend` service).
- **Background Sync Engine** — Added a silent background worker in `server.js` to securely push local SQLite tracking data to the cloud API.
- **Sync Tracking** — Modified local SQLite schemas to securely track the sync status of local sessions and app usage.

### UI Polish & Enhanced UX
- **Interactive Tooltips** — Replaced static UI with smooth, glassmorphic tooltips on hover for weekly charts and application usage lists.
- **Skeleton Loaders** — Implemented shimmering skeleton UI animations for all data-fetching states, replacing generic text.
- **Dynamic Greetings** — The dashboard title now contextually updates based on the time of day and active session ("Focus Mode").
- **Customizable Theme Accents** — Added an "Accent Color" section to Settings, allowing users to choose from 5 vibrant color gradients (Purple, Ocean, Sunset, Emerald, Rose).

## [1.2.1] - 2026-02-19

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
