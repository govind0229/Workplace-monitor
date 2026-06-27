# Workplace Monitor Production-Readiness Plan

This folder is the execution plan for taking Workplace Monitor from a feature-rich beta to a dependable production macOS application.

## Objective

Ship a signed, notarized, privacy-conscious application that preserves user data, behaves correctly across macOS lifecycle events, and can be installed and upgraded safely through Homebrew.

## Planning principles

- Freeze major feature development until Sprints 1–4 are complete.
- Correctness and data preservation take priority over visual improvements.
- Every defect fixed in critical timing logic must receive a regression test.
- Release jobs must fail closed: incomplete, unsigned, or untested builds must never be published.
- Upgrades must preserve the database and user settings.
- Normal uninstall should preserve user data; an explicit purge option may delete it.

## Sprint map

| Sprint | Theme | Depends on | Exit result |
| --- | --- | --- | --- |
| [Sprint 1](SPRINT-01-SECURITY-AND-CORRECTNESS.md) | Security and broken settings | None | Local API and settings behave correctly |
| [Sprint 2](SPRINT-02-AUTOMATED-TESTS.md) | Automated test foundation | Sprint 1 interfaces stabilized | Critical flows are protected by CI |
| [Sprint 3](SPRINT-03-HOMEBREW-AND-RELEASES.md) | Homebrew and release hardening | Sprint 2 | Atomic, signed, architecture-correct releases |
| [Sprint 4](SPRINT-04-DATA-SAFETY.md) | Migrations, backup, and recovery | Sprint 2 | Upgrades cannot silently destroy data |
| [Sprint 5](SPRINT-05-RELIABILITY-AND-ARCHITECTURE.md) | Runtime reliability and modularization | Sprints 2 and 4 | Maintainable, recoverable runtime |
| [Sprint 6](SPRINT-06-PRIVACY-AND-DOCUMENTATION.md) | Privacy controls and documentation | Sprint 5 | User-visible controls match actual behavior |
| [Sprint 7](SPRINT-07-RELEASE-CANDIDATE.md) | Production candidate validation | All previous sprints | Evidence-based stable release decision |

## What goes first

Begin with Sprint 1 in this exact order:

1. Bind the server to `127.0.0.1` and restrict CORS.
2. Add shared API validation and controlled error responses.
3. Fix default-project persistence.
4. Make wellbeing enablement and break-mode settings control the backend.
5. Resolve configurable-port behavior across Node, Swift, launcher, and frontend.
6. Decide whether Intel remains supported; do not advertise it until it works.

The first implementation change should be the localhost networking fix. It is small, independently testable, and closes the most serious security gap without changing stored data.

## Release gates

The application is production-ready only when all gates pass:

- No known critical or high-severity security issue remains.
- Critical session and time calculations pass automated tests.
- A failed migration restores the previous database.
- Fresh install, upgrade, uninstall, sleep/wake, midnight, timezone, and offline tests pass.
- Every distributed binary matches its advertised architecture.
- The app and installer are signed, notarized, and validated by Gatekeeper.
- Homebrew never publishes a cask before all referenced assets exist.
- Users can pause, export, back up, restore, and delete their data.
- A release candidate completes at least one week of daily use without lost or duplicated time.

## Suggested release sequence

- `7.1.0-alpha.1`: Sprints 1–2 complete
- `7.1.0-beta.1`: Sprints 3–5 complete
- `7.1.0-rc.1`: Sprints 1–6 complete
- `7.1.0`: Sprint 7 acceptance gates complete

Version numbers may change, but the gates should not.

