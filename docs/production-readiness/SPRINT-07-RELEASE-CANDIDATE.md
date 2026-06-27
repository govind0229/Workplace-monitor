# Sprint 7 — Release Candidate Validation

## Goal

Validate production behavior through staged releases and real daily usage.

## Test matrix

- Fresh Homebrew installation
- Upgrade from the previous two stable versions
- Every supported CPU architecture
- Every supported macOS version
- Login startup and single-instance behavior
- Sleep, wake, lock, unlock, and restart
- Midnight, timezone, and daylight-saving transitions
- Offline operation and network recovery
- Location permission granted, denied, and revoked
- Notification and Apple Events permission changes
- Database migration failure and restoration
- Cloud-sync timeout and invalid credentials
- Homebrew uninstall and optional purge

## Candidate stages

1. Alpha: maintainers and disposable test data.
2. Beta: limited users with backups and diagnostic reporting.
3. Release candidate: normal daily use for at least one week.
4. Stable: publish only after all gates pass.

## Evidence to collect

- Crash and forced-restart results
- Lost or duplicated time incidents
- CPU, memory, and battery measurements
- Database size and integrity results
- Sync success and retry behavior
- Geofence transition accuracy
- Installation and upgrade outcomes
- Signed/notarized package verification

## Stop-ship conditions

- Lost or duplicated session data
- A remotely reachable local API
- Broken upgrade or migration path
- Incorrect architecture in a package
- Missing signature or notarization
- High-severity privacy or security defect
- Release asset and Homebrew checksum mismatch

## Exit criteria

- All release gates in the master plan pass.
- No stop-ship condition remains open.
- The release candidate completes at least one week of daily use without data loss.
- Installation, upgrade, and rollback instructions have been exercised successfully.

