# Sprint 3 — Homebrew and Release Hardening

## Goal

Keep Homebrew as the recommended distribution channel while making releases atomic, signed, architecture-correct, and reversible.

## Work items

### 1. Architecture policy

- Decide whether to support Apple Silicon only or both Apple Silicon and Intel.
- If Intel remains supported, build on a genuine Intel runner.
- Verify the Swift binary, bundled Node.js, and every native dependency with `file` or `lipo`.
- Never substitute an ARM checksum or artifact for a missing Intel build.
- Make the cask reject unsupported architectures clearly.

### 2. Stable identity

Standardize these values across every file:

- Application name and bundle directory
- Bundle identifier
- Package receipt identifier
- LaunchAgent label and filename
- Application Support directory
- Executable paths

Create an upgrade migration for any legacy LaunchAgent name rather than leaving duplicate agents.

### 3. Signing and notarization

- Sign nested executables before signing the app bundle.
- Use Developer ID Application signing with hardened runtime.
- Sign the installer with Developer ID Installer.
- Submit for Apple notarization and staple the result.
- Fail the release if certificates or notarization are unavailable.
- Remove quarantine-bypass behavior from installer scripts.

### 4. Atomic release workflow

Release only from a version tag such as `v7.1.0`.

Required order:

1. Run all tests.
2. Build every supported architecture.
3. Verify architecture and package contents.
4. Sign and notarize.
5. Create the GitHub release and upload assets.
6. Download the assets again and verify checksums.
7. Update the stable Homebrew cask.
8. Run Homebrew audit and install smoke tests.

Do not run release publishing after a failed build. Do not tolerate missing artifacts.

### 5. Cask quality

- Keep one stable `workinghours` cask.
- Avoid creating a permanent versioned cask for every patch release.
- Add explicit process and LaunchAgent cleanup to `uninstall`.
- Add an optional `zap` stanza for user data and logs.
- Preserve Application Support data during normal upgrades and uninstall.
- Document `brew install --cask`, `brew upgrade --cask`, and `brew uninstall --cask`.

### 6. Automated checks

- `brew style`
- `brew audit --strict --online`
- `pkgutil --check-signature`
- `codesign --verify --deep --strict`
- `spctl --assess`
- `stapler validate`
- Fresh Homebrew install
- Upgrade from the previous stable version
- Uninstall and optional purge

## Exit criteria

- A tap commit can never reference a missing release asset.
- Every supported package contains only compatible native binaries.
- Gatekeeper accepts the app without workarounds.
- Upgrade preserves the database and settings.
- Uninstall removes processes and LaunchAgents without deleting user data by default.

