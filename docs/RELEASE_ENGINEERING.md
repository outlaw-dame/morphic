# Release Engineering

## Overview

This document defines the release process for Morphic's native mobile app (iOS/Android via Capacitor hosted shell).

## Architecture

```
Web App (Next.js)               Native Shell (Capacitor)
─────────────────               ─────────────────────────
Deployed to Vercel/server       Built locally or in CI
Updates instantly (no store)    Updates require store review (rarely)
Contains all app logic          Contains only WebView + native config
Versioned via git tags          Versioned via build number
```

## Versioning Strategy

### Web App

- Follows `package.json` version (semver)
- Deploys on every push to main
- No store review needed

### Native Shell

- Uses `appVersion` from capacitor.config.ts (matches package.json)
- Build number increments per store submission
- iOS: CFBundleShortVersionString + CFBundleVersion
- Android: versionName + versionCode

### Build Number Convention

```
versionName: "1.4.0"  (from package.json)
versionCode: YYYYMMDD##  (e.g., 2026061801 for first build on 2026-06-18)
```

## Release Process

### Web App (Continuous)

1. PR merged to main
2. CI runs (lint, typecheck, format, test, build, native-verify)
3. Auto-deploy to production (Vercel)
4. Native shell picks up changes automatically (hosted WebView)

### Native Shell (Store Submission)

Only needed when native config changes. Steps:

1. **Pre-release checklist:**
   - [ ] `bun run cap:verify` passes
   - [ ] All CI checks green
   - [ ] `loggingBehavior: 'none'` confirmed
   - [ ] `server.cleartext: false` confirmed
   - [ ] No `.env` files in native dirs
   - [ ] App version bumped in `package.json`
   - [ ] Build number incremented

2. **Build:**

   ```bash
   bun run cap:sync
   # iOS
   cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App archive
   # Android
   cd android && ./gradlew assembleRelease
   ```

3. **Submit:**
   - iOS: Upload to App Store Connect via Xcode or `xcrun altool`
   - Android: Upload to Play Console

4. **Post-release:**
   - Tag the release: `git tag -a v1.4.0-native.1 -m "Native shell release"`
   - Push tag: `git push origin v1.4.0-native.1`

## When Native Shell Updates Are Required

| Change                                | Requires Store Update? |
| ------------------------------------- | ---------------------- |
| Web app UI/feature changes            | No (hosted WebView)    |
| capacitor.config.ts server.url change | Yes                    |
| New Capacitor plugin added            | Yes                    |
| iOS permission added (Info.plist)     | Yes                    |
| Android permission added (Manifest)   | Yes                    |
| App icon or splash change             | Yes                    |
| Deep link domain change               | Yes                    |
| Push notification config change       | Yes                    |

## Signing (Future)

### iOS

- Distribution certificate: managed in App Store Connect
- Provisioning profile: specific to bundle ID `social.morphic.app`
- Stored in CI secrets, never committed

### Android

- Upload keystore: generated once, backed up securely
- Stored in CI secrets as base64-encoded env var
- Play App Signing: enabled (Google manages distribution key)

## CI for Native Builds (Future)

When native projects are committed:

```yaml
# .github/workflows/native-build.yml (future)
jobs:
  android-debug:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: 17 }
      - run: bun install && bun run cap:sync
      - run: cd android && ./gradlew assembleDebug

  ios-validate:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install && bun run cap:sync
      - run: cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App build
```

## App Store Metadata (Future)

Store listing assets will live in:

```
store/
├── ios/
│   ├── screenshots/
│   ├── description.md
│   └── release-notes.md
└── android/
    ├── screenshots/
    ├── description.md
    └── release-notes.md
```

These are not created yet — deferred to Phase 22 (Store Compliance).
