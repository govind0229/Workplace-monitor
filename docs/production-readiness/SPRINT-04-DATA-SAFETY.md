# Sprint 4 — Data Safety and Recovery

## Goal

Ensure an upgrade, crash, migration error, or database problem cannot silently destroy tracked time.

## Work items

- Add a schema-migrations table with ordered migration versions.
- Execute every migration in a transaction.
- Back up the database before migration.
- Restore the previous database automatically if migration fails.
- Run SQLite integrity checks during startup.
- Add rotating automatic backups with configurable retention.
- Add “Backup now” and “Restore backup” controls.
- Add complete JSON export and import.
- Retain CSV for report-oriented exports.
- Add explicit retention and permanent-deletion controls.
- Use transactions for session splitting, project changes, and sync checkpoint updates.
- Display a recovery screen when integrity checks fail.

## Tests required

- Upgrade from each supported historical schema.
- Interrupted and failed migration recovery.
- Restore from valid, old, malformed, and incomplete backups.
- Crash during a session split or project change.
- Database locked, disk full, and permission-denied behavior.

## Exit criteria

- Failed migrations leave the original database usable.
- Backup and restore complete successfully in automated tests.
- No tested crash scenario loses completed session data.
- Users can export all personal data in a documented format.

