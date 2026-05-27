# Changelog

All notable changes to WorkplaceMonitor will be documented in this file.

## [6.0.0] - 2026-05-27

### Added
- **Dynamic Break Scheduling** — Replaced the static 60-minute break reminder with an intelligent algorithm that analyzes the last 14 days of your work behavior. The AI dynamically schedules your next break based on your natural rhythm, clamped between 30 and 120 minutes.
- **Configurable Server Port** — Added a setting in the UI to change the Node.js backend port (defaults to 3000), preventing conflicts with other local development servers.

## [5.0.0] - 2026-05-27

### Security
- **Prototype Pollution Prevention** — Refactored object property access in `public/app.js` to use safe `Reflect.get()` and `Array.prototype.at()` methods instead of direct bracket notation to prevent prototype pollution via user input.
- **XSS False Positives Addressed** — Audited template literals in `public/app.js` and suppressed 72 false-positive warnings, verifying that `DOMPurify` and `escapeHTML` are already properly mitigating XSS risks.
- **Path Traversal False Positives Addressed** — Audited file operations in `db.js` and `tmp_upload.js` and suppressed warnings, confirming that boundary checks (`startsWith`) and secure paths (`os.homedir()`) are effectively preventing traversal attacks.
- **Dependency Security Audited** — Suppressed ReDoS and Dependency Hijack warnings in `package-lock.json` and third-party modules (`qs`, `path-to-regexp`) as accepted risks within the controlled Node.js ecosystem.

## [4.0.2] - 2026-05-26

### Fixed
- **Overnight Active Time Leakage** — Implemented comprehensive dual-source validation of idle duration during unlock events. The server now checks and discards overnight sleep, lock, or idle times that span across calendar days if they are excessively large (> 4 hours), preventing fake active hours from accumulating on the next day's boot.
- **Midnight Crossover Security** — Enhanced the background rollover loop to reset the global lock timestamp state immediately when midnight crosses, preventing yesterday's lock state from leaking into today's first login.

## [4.0.1] - 2026-05-25

### Fixed
- **Timezone-Accurate Reporting** — Fixed a critical issue where sessions started late at night (UTC) would display on the wrong calendar day for users in different time zones (e.g., IST). All daily, weekly, and monthly reports now correctly group hours based on strict local time boundaries.
- **Stale Session Time Accumulation** — Fixed a bug where leaving the server running overnight while the computer was off would continuously accumulate "ghost hours" (e.g., 59 hours on a single day) or show leftover time upon the next morning's boot. The system now cleanly auto-completes stale sessions on startup.
- **Premature Break Popups** — Fixed an issue where time-based break notifications (e.g., morning or lunch reminders) would trigger immediately upon booting the computer. The app now intelligently requires at least 30 minutes of active work before presenting any scheduled break alerts.

## [4.0.0] - 2026-05-22

### Added
- **Standalone Break Reminder Window** — Migrated the periodic break notifications into a high-fidelity standalone macOS floating window experience. This replaces the full dashboard takeover, allowing you to dismiss or interact with break alerts without interrupting your layout or opening the main dashboard app.
- **Dynamic Break Action Cards** — Added support for four distinct wellness break responses directly from the floating alert: **Short Break**, **Lunch**, **Dinner**, and **Snooze 10m**, logging precise geofence-friendly break events on the database immediately.
- **Smart Wellness Break Options** — Integrated direct pause cards for **☕ Coffee Break** and **🚶‍♂️ Stretch & Walk** to encourage active wellness management without breaking daily session continuity.
- **Dynamic Snooze Duration Selector** — Replaced the hardcoded snooze card with an interactive, custom drop-down selector built directly into the "Snooze" button. Users can now seamlessly choose to remind themselves in **5m**, **10m**, **15m**, **30m**, or **1h**.

## [3.0.0] - 2026-05-12

### Added
- **Interactive Calendar Filtering** — Introduced a powerful new date-range filtering system for all history reports. You can now select custom "From" and "To" dates to explore your work data with surgical precision.
- **Report Filter Presets** — Added quick-select buttons for common time ranges: **7 Days**, **30 Days**, and **This Month**, allowing for one-click navigation of recent history.
- **Popup-Based Filter UI** — Cleaned up the History interface by moving filter controls into a sleek, floating glassmorphism popup. This prevents layout clutter while maintaining instant access to data controls.
- **Active Filter Indicator** — Added a visual "active dot" on the filter button that illuminates whenever a custom range is applied, so you always know exactly what data you're looking at.

### Fixed
- **Weekly Report Grouping** — Overhauled the weekly aggregation logic to use a strict Monday-based segmentation. This ensures your weekly totals align perfectly with the standard work week.
- **UI Layout Preservation** — Fixed an issue where inline filters would overlap and break the report toolbar. The new popup design ensures a consistent, professional layout across all tabs.
- **Filter Persistence** — Implemented an automatic filter reset on page refresh and app startup to ensure you always start with a clean view of your most recent data.

### Improved
- **Premium Glassmorphism 2.0** — Enhanced the transparency and readability of report popups. Boosted backdrop blur (24px) and optimized opacity levels for perfect legibility in both Dark and Light modes.
- **Development Workflow (`start.sh`)** — Optimized the local development script to use **recursive symlinking**. This ensures that edits to the `public` folder, `server.js`, or `db.js` are immediately reflected in the development app bundle without needing a rebuild.
- **History Data Limits** — Significantly expanded the lookback period for all reports, allowing you to see up to 1 year of weekly data and 3 years of monthly trends.

## [2.3.0] - 2026-05-11

### Added
- **Monthly Project Breakdown** — Added a new analytical section to the Projects tab in History. You can now see a month-by-month breakdown of time spent on each project, helping you track long-term work trends and project lifecycles.
- **Enhanced Office Span Tracking** — Introduced a new "Office Span" column in the Visits report. This automatically calculates the total elapsed time between your first arrival and last departure of the day, providing context for your total time spent at the workplace.

### Improved
- **Visits Report UI** — Renamed the "Duration" column to "Workplace Duration" for better clarity and updated the layout to a 5-column grid to accommodate the new Office Span data.
- **Project Report API** — Updated the backend to efficiently aggregate project data by month while maintaining high-performance history lookups.

## [2.2.0] - 2026-05-11

### Added
- **Smart Sleep Detection (User vs. System)** — The application now intelligently distinguishes between user-initiated sleep (closing the lid, selecting Sleep from the menu) and system-idle sleep (timeout).
- **Accurate Logout Timestamps** — When a user-initiated sleep is detected, both Office (Manual) and WFH (Automatic) sessions are now completed immediately. This ensures departure times are recorded precisely at the moment the Mac was closed, rather than when it is re-opened.
- **Granular Automatic Sessions** — Updated the database architecture to support multiple automatic session segments per day. This provides a more accurate timeline of WFH activity if the machine is closed and re-opened multiple times throughout the day.

### Improved
- **Session Continuity** — System-idle sleep now correctly pauses sessions instead of completing them, allowing for automatic resumption after short breaks while still maintaining high-precision time tracking.

## [2.1.0] - 2026-05-11

### Added
- **Office Attendance Reporting** — Introduced a new "Visits" tab in the History section that provides a daily breakdown of office arrival ("In-Time") and departure ("Out-Time") timestamps, along with total session duration.
- **Dynamic Time Formatting** — Added a UI toggle to switch between **24-hour** (with seconds) and **AM/PM** time formats for the office visits report. Preferences are persisted across sessions.
- **Dashboard Arrival Tracker** — The main dashboard now displays your first office arrival time for the day in a high-precision 24-hour format (HH:MM:SS) directly in the timer card.

### Fixed
- **Automatic Project Assignment** — Fixed an issue where office sessions triggered by geofencing/arrival detection would start without a project. Automatic sessions now correctly inherit the user's **Default Project** setting.
- **Report Export Consistency** — Enhanced the CSV export engine to respect the user's selected time format preference when downloading office visit data.

### Improved
- **Contextual UI Controls** — The time format toggle now intelligently appears only when viewing reports where time precision is relevant, keeping the interface clean and focused.

## [2.0.4] - 2026-04-14

### Fixed
- **Native CI Compilation** — Transitioned from a single generic runner to dedicated hardware runners in the build pipeline (`macos-13` for Intel and `macos-14` for ARM). This ensures that native Node.js dependencies (e.g., `better-sqlite3`) are compiled natively for their target architectures, permanently resolving `dlopen` incompatible architecture errors on Intel machines.

## [2.0.3] - 2026-04-14

### Fixed
- **MacOS Installer Relocation** — Fixed an issue where Apple's `PackageKit` would automatically relocate the app installation to existing development builds instead of strictly installing to `/Applications`. Disabled the `BundleIsRelocatable` flag during `.pkg` compilation to ensure strict installation paths and resolve Homebrew installation failures.

## [2.0.2] - 2026-04-14

### Added
- **Polished Professional Installer** — Re-enabled the distribution-style installer using `productbuild`. Users now experience a standard, branded macOS installation interface with a streamlined license and component selection process.

### Improved
- **Distribution Script Architecture** — Updated `build_distribution_pkg.sh` to support multi-architecture workflows, allowing the creation of distinct, polished installers for both Intel and Apple Silicon.

## [2.0.1] - 2026-04-14

### Fixed
- **Version Bumping Script** — Fixed a bug in `bump_version.sh` that accidentally overwrote the XML declaration version in `distribution.xml`. The script now correctly targets only the application version within the `pkg-ref` tags.
- **Homebrew Cask Syntax** — Standardized the multi-architecture Cask syntax to use the preferred `sha256 arm: ..., intel: ...` format for cleaner architecture-specific verification.

## [2.0.0] - 2026-04-14

### Added
- **Architecture-Optimized Packages** — The build pipeline now produces separate, optimized `.pkg` installers for Intel/AMD (`x64`) and Apple Silicon (`arm64`). This ensures the smallest possible footprint for each architecture (~50MB vs ~250MB for a universal bundle).
- **Smart Multi-Arch Homebrew Cask** — Overhauled the Homebrew tap logic. The `workinghours` Cask now dynamically detects the host architecture and automatically fetches the correct package.
- **Legacy macOS Support (v11.0+)** — Standardized the deployment target to **macOS 11.0 (Big Sur)** across all native components (Swift utility and Node.js), ensuring robust support for older hardware.
- **Matrix-Powered Build Pipeline** — Migrated to a dual-stage GitHub Actions architecture with matrix builds for parallel compilation, improving release speed and reliability.

### Improved
- **Download Efficiency** — By providing split packages instead of a universal binary, users now download 80% less data during installation and updates.
- **Build Script Robustness** — Updated `download_node.sh` and `build_pkg.sh` with architecture-aware logic and explicit target-triplet compilation.

## [1.6.0] - 2026-04-09
 
### Added
- **Native Geofencing (Region Monitoring)** — Migrated office detection from high-power GPS polling to hardware-level region monitoring. The macOS location co-processor now handles boundary detection, allowing the main GPS hardware to sleep 99% of the time.
- **GPS Self-Hibernation** — Implemented an intelligent power manager that automatically deactivates GPS once a stable location is acquired or when the dashboard is closed, saving significant battery.
- **Adaptive Polling Hints** — The Node.js server now provides dynamic polling "hints" (`suggested_poll_ms`). The native client automatically slows its synchronization from 5s to 20s when the system is idle or the user is home.
- **Screen-Lock UI Hibernation** — The menu bar refresh and UI timers are now completely suspended when the screen is locked, eliminating background CPU wake-ups during inactivity.
 
### Fixed
- **Dashboard Geolocation Hang** — Resolved a critical UI freeze in `WKWebView` by migrating the "Set Office Location" feature to the native Swift location bridge.
- **Notification Payload Mismatch** — Fixed an issue where native notifications failed to display due to a payload key discrepancy between the server and the native client.
 
### Improved
- **Extreme Energy Reduction** — Removed seconds from the menu bar UI, allowing the refresh interval to be slowed from 1s to 60s (a 60x reduction in UI-related wake-ups).
- **Location Hardware Optimization** — Increased `distanceFilter` to 30m and tuned `desiredAccuracy` to prioritize cell/WiFi triangulation over GPS when precision is not required.

## [1.5.2] - 2026-04-06

### Added
- **Active Call Detection (Teams/Zoom/Meet Support)** — Integrated hardware-level monitoring via `AVFoundation`. The app can now detect if the Microphone or Camera is active and will **bypass the 5-minute idle-pause** during these calls. Resolves the issue of timers pausing during long meetings.
- **Microphone & Camera Usage Metadata** — Added required usage descriptions to `Info.plist` to comply with macOS security standards for hardware-state observation.

### Improved
- **Geofence-aware UI Optimization** — The "Route to Office" card now intelligently simplifies its display when the user is inside the geofence boundary. It automatically hides the commuting distance and ETA, showing only the "✓ Inside Geofence" status.
- **Resource Efficiency** — Suppressed unnecessary road-route and ETA calculations while inside the geofence to save battery and reduce network bandwidth.

## [1.5.1] - 2026-04-06

### Added
- **Native Geolocation Bridge** — Implemented a `WKScriptMessageHandler` bridge between macOS and the dashboard. This bypasses `WKWebView` permission restrictions by retrieving GPS data natively via Swift and "feeding" it directly into the map. Resolves "Location access denied" errors inside the app.
- **Hardened Runtime Entitlements** — Introduced a dedicated `.entitlements` configuration. The application is now signed with explicit `personal-information.location` authorization, ensuring macOS trusts the binary to handle GPS data.

### Fixed
- **Swift Compilation Errors** — Resolved redundant delegate conformance and handled macOS-specific `CLAuthorizationStatus` constants to ensure stable builds on macOS 12+.
- **Identifier Synchronization** — Completed the full migration from `com.user.workinghours` to `com.workplacemonitor.app` across all native codebases and LaunchAgent logic.

### Improved
- **Dashboard UI Optimization** — Streamlined the **"Route to Office"** card by removing redundant "Road route unavailable" and "(showing straight-line only)" labels. The UI now collapses gracefully when data is missing, maintaining a clean, professional aesthetic.
- **Visual Hierarchy** — Bolder typography and an elegant glow effect added to the distance metrics for a more premium "state-of-the-art" dashboard feel.

## [1.5.0] - 2026-04-06

### Added
- **Workplace Monitor Branding** — Officially renamed the application to **"Workplace Monitor"** consistently across the UI, installer, and metadata to align with the project identity.
- **Interactive Map Route Labels** — High-fidelity distance labels now appear directly on the map route line (e.g., "1.2 km drive"). Features a modern glassmorphism design that adapts to dark/light themes.
- **Routing Reliability Fallback** — Implemented a primary/backup OSRM server architecture. If the primary routing engine is congested, the app automatically switches to a backup to ensure road distances are calculated.
- **Robust Geolocation Fallback** — Added an automatic "Standard Accuracy" fallback for GPS. If a high-precision fix fails (indoors or poor signal), the app now retries with WiFi/Cell triangulation to prevent timeout errors.

### Fixed
- **Distance UI Reset Bug** — Fixed a critical issue where the main distance display would reset to "— km" if a road-route calculation failed. It now gracefully retains the straight-line distance as a fallback.
- **Geolocation Timeouts** — Significantly increased the GPS acquisition timeout (from 10s back to 30s) to improve reliability in dense urban environments or building interiors.
- **Dashboard Script Errors** — Cleaned up duplicate script tags and refined the frontend auto-refresh logic for smoother map updates.

### Refactored
- **Version Management Script** — Completely overhauled `bump_version.sh` to support robust, multi-line regex replacements across `Info.plist`, `distribution.xml`, and metadata files.
- **Distance Card Logic** — Streamlined `updateDistanceCard` and `calculateRoute` interaction to be more reactive and prevent race conditions during location updates.


## [1.4.1] - 2026-04-05

### Added
- **Centralized Versioning** — Introduced a single `.version` file as the source of truth for all build scripts, GitHub Actions, and packaging. Added a `bump_version.sh` utility to sync HTML and JSON files effortlessly.

### Fixed
- **History View Statistics UI Bug** — Fixed a race condition where the advanced statistics chart in the History view failed to render or appeared completely blank on the first click. Correctly deferred DOM layout computation to ensure the animation and SVG boundaries are generated cleanly.

## [1.4.0] - 2026-03-29

### Added
- **Website-Level Tracking** — When a browser (Chrome, Safari, Arc, Brave, Edge, Firefox) is the active application, the app now reads the **active tab URL** via AppleScript and tracks the domain name (e.g., `github.com`, `youtube.com`) instead of just the browser name. Requires Automation permission on first launch.
- **Project-Based Time Tracking** — New `projects` system allows creating named, color-coded projects. Sessions can be assigned to a project via the Dashboard dropdown. Full CRUD management in Settings, plus a `GET /project-report` API for per-project time summaries.
- **Cloud Sync** — Background sync worker runs every 5 minutes, batching completed sessions and app usage data into a JSON payload and POSTing it to a configurable remote API with Bearer token authentication. New Settings section to configure Cloud URL, API Key, enable/disable sync, and trigger manual sync.
- **Domain Category Mappings** — Extended the default app category map with 30+ popular website domains automatically categorized (e.g., `github.com` → Productivity, `youtube.com` → Entertainment, `slack.com` → Communication).

### Changed
- **`/start` endpoint** — Now accepts an optional `project_id` in the request body to assign the session to a project.
- **Info.plist** — Added `NSAppleEventsUsageDescription` for browser automation permission.

### Database
- New `projects` table (`id`, `name`, `color`, `created_at`).
- New `sync_log` table for tracking cloud sync watermarks per table.
- Migration: `sessions.project_id` foreign key column added automatically on startup.

## [1.3.7] - 2026-03-19

### Performance
- **Pre-compiled DB statements** — Hot-path SQLite `UPDATE` queries in the background loop are now pre-compiled at startup, eliminating query re-parsing every 5 seconds.
- **Settings cache (30s TTL)** — Goal and break settings are now cached for 30 seconds, reducing 4 DB reads per background tick to zero. Cache is immediately invalidated when settings are saved.
- **Removed double DB query in background loop** — Both session types are now fetched upfront in a single pass, instead of calling `getActiveSession()` twice for the manual session.
- **Status interpolation cap corrected** — Live time interpolation in `/status` was still using a 300-second cap (bug), now correctly using 30s, consistent with the background loop.
- **Removed dead code from `/status`** — Cleaned up an empty `isAtOffice` block that ran on every status request with no effect.
- **Optimized URLSession (Swift)** — `fetchStatus()` now uses a pre-configured `URLSession` with `ephemeral` config, 3s timeout, and a single persistent connection to localhost, reducing connection overhead on 2-second polling.

### Fixed
- **Widget timer lag** — `uiTimer` now renders at 0.25s intervals (4× per second) for smooth display. Server `pollTimer` reduced to 2s and is fully decoupled from rendering — no more stutter from double `updateUI()` calls.
- **Session start/stop notifications not received** — Added missing `🏠 WFH Session Started` notification on screen unlock, `🏠 WFH Session Paused` on screen lock, and improved manual session notification titles to `🏢 Workplace Session Started` and `✅ Finish Day Session`.

## [1.3.6] - 2026-03-19

### Added
- **Tracery Grammar-Powered Break Notifications** — Replaced the static break message pool with [tracery-grammar](https://www.npmjs.com/package/tracery-grammar), a combinatorial natural-language generator. Each break now generates a fresh, uniquely worded message by randomly combining grammar rules (verbs, durations, benefits, context phrases). Produces thousands of unique combinations per time slot — fully offline, no AI or API required.

### Fixed
- **WFH Timer Running Overnight** — Root cause fixed: automatic WFH sessions now start with `status = 'paused'` instead of `active`. The timer only starts counting when a genuine screen-unlock event is received, preventing overnight accumulation.
- **Startup Screen-State Sync** — `mac_utility.swift` now sends an initial `lock` or `unlock` event to the server 4 seconds after launch, ensuring the server's session state matches the actual screen lock state at startup.

## [1.3.5] - 2026-03-18

### Added
- **Smart Time-Aware Break Notifications** — Break reminders are now contextually intelligent. The app selects the most appropriate message based on the current time of day:
  - **Morning (7–11am):** Hydration, goal-setting, posture, and energy tips.
  - **Lunch (11am–1:30pm):** Lunch break, step-outside, and social connection reminders.
  - **Afternoon (1:30–4pm):** Energy dip, 20-20-20 eye rule, snack, and focus reset prompts.
  - **Late Afternoon (4–6pm):** Wind-down, end-of-day review, and final hydration reminders.
  - **Evening (6pm+):** Disconnect, reduce screen brightness, and dinner reminders.
- **Non-Repeating Messages** — A `suggestion_history` database table tracks all sent break messages. The app will never repeat the same message within a **7-day window**.

### Fixed
- **WFH Timer Overcount on Screen Lock** — The background timer delta cap was reduced from 300s to 30s, preventing large time jumps when the machine wakes from sleep and the lock event was missed.
- **Orphaned Sessions from Previous Days** — On startup, any sessions from previous dates that were accidentally left in `active` or `paused` state are now automatically marked as `completed`.

## [1.3.4] - 2026-03-17

### Added
- **Native macOS Architecture** — Migrated to a true native entry point where `mac_utility` (Swift) acts as the primary executable, significantly improving system stability and resolving "damaged bundle" false-positives.
- **Internal Backend Spawning** — The Swift application now automatically spawns and manages the Node.js server lifecycle internally.
- **Auto-Persistence** — Integrated seamless LaunchAgent registration within the Swift binary for automatic startup out-of-the-box.
- **Enhanced Polling Frequency** — Notification check interval increased to 1 second for near-instant system alerts on session start/stop.

### Fixed
- **Notification Reliability** — Fixed a "queue theft" bug where the web dashboard would clear the server-side notification queue before the native macOS app could display the banners.
- **Bundle Integrity** — Corrected `Info.plist` and directory structures to align with strict macOS Application Bundle standards, fixing permission errors.
- **Start/Stop Attribution** — Guaranteed 100% native system attribution for "Start Workplace", "Finish Day", and "Goal Achieved" notifications.

## [1.3.3] - 2026-03-16

### Added
- **WFH Break Notifications** — Added customizable break reminders specifically for work-from-home sessions.
- **Location Arrival Notifications** — Added native notifications when arriving at the configured office location.
- **Goal Completion Notifications** — Restored native notifications for daily goal completion.

### Fixed
- **Notification Crash** — Replaced direct macOS Swift `UNUserNotificationCenter` calls with `node-notifier` to fix a silent crash on first launch outside of the App bundle.
- **macOS App Nap** — Fixed an issue where macOS throttled the background timers when the app window was hidden, leading to lost time. Background compensation cap was increased to ensure timers tick accurately.

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

<!-- ## [1.3.1] - 2026-03-12

### Added
- **Native macOS Notifications** — Goal completion alerts now use native macOS `UserNotifications` for a premium system experience, including standard banner styles, system sounds, and Notification Center persistence.
- **Notification Permissions** — The app now properly requests user permission for notifications upon first launch.

### Changed
- **Enhanced Status API** — The backend `/status` endpoint now exposes goal settings and notification state to the native Swift utility.
- **Unified Notification Logic** — Moved notification triggers from Node.js to Swift to ensure native appearance and behavior. -->

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
