# Workplace Monitor: Implemented Features

This document provides a detailed technical breakdown of the features designed and implemented by the AI coding assistant (Antigravity).

---

## 1. Top Apps Timeline Range Filter
Allows users to switch the "Top Apps Timeline" chart between **1 Day**, **1 Week**, and **1 Month** views.

* **UI Element:** Selector tabs (`#appTimelineTabs`) in the card header.
* **Backend Endpoint:** `/app-timeline?range=[day|week|month]`
  - **Day:** Calculates hourly app usage for today. Displays hour labels like `9a`, `12p`, `1p`.
  - **Week:** Groups database events from `app_usage_timeline` by date over the last 7 days. Returns weekdays (e.g. `Mon`, `Tue`).
  - **Month:** Groups database events by date over the last 30 days. Returns formatted dates (e.g. `Jun 25`, `Jun 26`).
* **Tooltip Formatting:** Displays durations in minutes (`45m`) for values under 60 minutes, and hours + minutes (`2h 15m`) for larger values. If minutes are exactly 0, it displays only hours (e.g. `2h`).

---

## 2. Dashboard Layout Customization (Settings-Based)
Allows users to reorder the 6 cards on the main dashboard tab and persist their configuration.

* **List of Cards:**
  1. `cardWeeklyChart` (Last 7 Days)
  2. `cardGoalProgress` (Goal Progress Rings)
  3. `cardAppCategories` (Today's App Categories)
  4. `cardAppsTimeline` (Top Apps Timeline)
  5. `cardAppUsage` (Top Apps Usage list)
  6. `cardActivityTimeline` (Daily Activity Timeline)
* **Customization View:** Located in Settings (`#settingsView`). Users can move cards up or down, click **Save Layout** to apply, or click **Reset Default** to revert to the stock layout.
* **State Management:**
  - `dashboard_card_layout` key in `localStorage` stores the serialized order array.
  - **Live Preview:** Moving items in the settings list updates the dashboard cards instantly using `appendChild` (reordering the DOM elements rather than replacing them, which keeps ChartJS event listeners active).
  - **Auto-Rollback:** If the user exits the Settings view while having unsaved changes (`isLayoutDirty === true`), the dashboard layout rolls back to the previously saved state.
  - **Sync Suspension:** Background updates (`loadDashboardCharts()` and `/status` updates) are paused while layout customization is active to prevent page refreshes from disrupting the user's reordering flow.

---

## 3. Dynamic Row Grid Sizing
Solves the grid-squishing problem where wide cards (like charts) became unreadable when moved into columns configured for narrow cards (like the progress ring card).

* **Width Classifications:**
  - `wide`: `cardWeeklyChart`, `cardAppsTimeline`, `cardActivityTimeline`
  - `medium`: `cardAppCategories`, `cardAppUsage`
  - `narrow`: `cardGoalProgress`
* **Dynamic Grid Layout Rules (`adjustRowGridTemplates`):**
  Inspects the children of the dashboard row containers and assigns classes based on column combinations:
  - **Narrow + Wide / Wide + Narrow:** Applies `320px 1fr` or `1fr 320px` to fit the Goal Progress ring card alongside a wide chart.
  - **Medium + Wide / Wide + Medium:** Applies `350px 1fr` or `1fr 350px`.
  - **Wide + Wide / Equal:** Applies `1fr 1fr` (50%/50% split).
* **Responsive Collapse:** Sizing logic is locked behind a media query `@media (min-width: 1001px)`. Below 1000px, all cards automatically collapse into a single-column `1fr` vertical list.

---

## 4. Goal Progress Rings (UI Redesign)
Redesigned the Goal Progress concentric rings and legends for maximum visual quality.

* **Concentric Rings:**
  - **Outer Ring (Desk Focus):** Fuchsia/purple gradient (`#8b5cf6` to `#d946ef`).
  - **Inner Ring (Office Presence):** Electric teal/cyan gradient (`#4facfe` to `#00f2fe`).
  - **Gradient Retention:** Removed old overrides that turned the tracks solid green or orange on completion. The rings now preserve their gradient colors at all times.
* **Ring Center:** Display is simplified to show a large, high-contrast percentage with a fuchsia drop-shadow and a clean `DESK GOAL` subtext label.
* **Card-Based Legend Grid:**
  - Replaced inline text with a 2-column hoverable grid (`.ring-legend-grid`).
  - Shows precise metrics: e.g. `85% (3h 30m)`.
  - Implements theme variables `var(--surface)` and `var(--border)` for high-contrast visibility in light mode and dark mode.
  - Adds hover effects (slight lift `translateY(-2px)` and shadow enhancements).

---

## 5. Burnout Prevention (Strict Mode) & Snooze Fixes
Enforces active health breaks and provides robust snooze configurations.

* **Strict Break Enforcement:**
  - If the user skips or snoozes break alerts consecutively beyond the limit configured in Settings ("Max Skips Before Lock"), the server triggers a shell command to lock the macOS screen immediately (`pmset displaysleepnow`).
* **Continuous Work Time Tracking:**
  - The system tracks continuous work time dynamically: `total_seconds - last_break_notify`.
  - Snoozing a break schedules `snooze_until = now + snooze_duration` and does not overwrite `last_break_notify`, preserving the work duration baseline.
  - Break popup displays dynamic duration strings: e.g. `45 minutes` (under 60 minutes) or `1 hour and 15 minutes` (60 minutes and over).
* **Verified Breaks:**
  - Active keyboard/mouse monitoring checks if the user is cheating during a break. If activity is detected, the break is canceled and the timer resumes.
