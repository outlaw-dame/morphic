# Secure Storage Threat Model

## Overview

This document defines the threat model for native secure storage in Morphic's mobile app. It must be reviewed and accepted before any secure storage plugin is installed.

**Status:** Threat model phase only. No Keychain/Keystore plugin installed yet.

## Threat Scenarios

### 1. Lost/Stolen Device

| Threat                                            | Mitigation                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Attacker gains physical access to unlocked device | Only non-sensitive preferences stored; no API keys or auth tokens |
| Attacker accesses app data via backup extraction  | Keychain items marked as non-backup-eligible                      |
| Attacker uses forensic tools on locked device     | iOS Keychain encrypted at rest; Android Keystore hardware-backed  |

### 2. Shared Device

| Threat                                 | Mitigation                                          |
| -------------------------------------- | --------------------------------------------------- |
| Next user sees previous user's data    | All user-specific storage cleared on logout         |
| Account confusion on multi-user device | Storage keyed by user ID; no global sensitive state |

### 3. Rooted/Jailbroken Device

| Threat                                 | Mitigation                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Root access reads Keychain/Keystore    | Accept risk — this is a platform-level compromise. App cannot fully mitigate. Document for users. |
| Injected code intercepts stored values | Same as above. Minimal data stored to limit blast radius.                                         |

### 4. Backup/Restore

| Threat                                          | Mitigation                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive data included in iCloud/Google backup | Keychain: mark `kSecAttrAccessible` as `whenUnlocked` and exclude from backup. Android: use `EncryptedSharedPreferences` which are hardware-bound. |
| Backup migrated to different device             | Credentials are device-bound; will not transfer. User must re-authenticate.                                                                        |

### 5. App Uninstall/Reinstall

| Threat                                          | Mitigation                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Orphaned data in Keychain after uninstall (iOS) | On first launch, check for orphaned keys and delete them.   |
| User expects clean slate after reinstall        | Clear all stored data on first launch if no active session. |

### 6. Logout

| Threat                                                | Mitigation                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sensitive storage survives logout                     | **MUST** clear all user-specific secure storage entries on logout                          |
| Race condition: logout starts but storage clear fails | Clear storage first, then destroy session. If clear fails, retry before completing logout. |

---

## What Can Be Stored

| Data                           | Allowed             | Storage           | Reason                                       |
| ------------------------------ | ------------------- | ----------------- | -------------------------------------------- |
| Device preference ID           | ✅                  | Keychain/Keystore | Non-sensitive device identifier              |
| Push notification device token | ✅                  | Keychain/Keystore | Needed for re-registration after app restart |
| Biometric authentication flag  | ✅                  | Keychain/Keystore | Boolean: user enabled biometrics             |
| Theme/UI preferences           | ⚠️ Use localStorage | N/A               | Not sensitive enough for Keychain            |

## What Cannot Be Stored

| Data                             | Reason                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| Auth tokens / refresh tokens     | Managed by Supabase via HTTP cookies — no native storage needed |
| API provider keys (OpenAI, etc.) | Server-side only — never enter client                           |
| Search/chat history content      | Privacy — only server-side database                             |
| Uploaded files or file metadata  | Server-side S3 storage                                          |
| Password or password hash        | Never stored client-side                                        |
| User email or PII                | Server-side only                                                |

---

## Storage Backend Requirements

### iOS: Keychain Services

- Use `kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- Exclude from backup (`kSecAttrSynchronizable: false`)
- Use access group scoped to app bundle ID

### Android: EncryptedSharedPreferences (Jetpack Security)

- Hardware-backed Keystore for master key
- AES-256 encryption
- Not included in auto-backup (configure `backup_rules.xml`)

### Capacitor Plugin

- When ready: `@capacitor-community/secure-storage` or equivalent
- Must be added to `docs/NATIVE_SAFETY.md` plugin allowlist
- Must pass 7-point plugin review

---

## Deletion Policy

| Event                        | Action                                               |
| ---------------------------- | ---------------------------------------------------- |
| Logout                       | Delete ALL user-specific secure storage entries      |
| Account deletion             | Delete ALL secure storage entries for the user       |
| App reset (settings)         | Delete ALL secure storage entries                    |
| First launch after reinstall | Check for orphaned keys, delete if no active session |

---

## Implementation Contract

```typescript
// lib/native/secure-storage.ts (future)

interface SecureStorageAPI {
  /** Get a value. Returns null if key doesn't exist or is not in allowlist. */
  get(key: AllowedSecureKey): Promise<string | null>

  /** Set a value. Rejects if key is not in allowlist. */
  set(key: AllowedSecureKey, value: string): Promise<boolean>

  /** Delete a specific key. */
  delete(key: AllowedSecureKey): Promise<boolean>

  /** Delete ALL user-specific entries (called on logout). */
  clearUserData(): Promise<void>

  /** Check if secure storage is available on this device. */
  isAvailable(): boolean
}

/** Only these keys can be stored — enforced at compile time */
type AllowedSecureKey =
  | 'device_preference_id'
  | 'push_device_token'
  | 'biometric_enabled'
```

---

## What This Document Does NOT Authorize

- Installing any Keychain/Keystore plugin
- Storing auth tokens in native storage (cookies remain the mechanism)
- Storing any user content locally
- Bypassing the `docs/NATIVE_SAFETY.md` plugin allowlist

These require a separate implementation PR after this threat model is accepted.

---

## Decision Record

| Decision                         | Rationale                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| No auth tokens in secure storage | Supabase manages session via HTTP cookies; adding native token storage creates a parallel auth state that can desync |
| Keychain-only, not Preferences   | Preferences plugin stores in plain text; secure storage must be encrypted                                            |
| Key allowlist at type level      | Prevents accidental storage of new sensitive data without review                                                     |
| Clear before session destroy     | Ensures no sensitive data orphaned if session destruction fails                                                      |
| Accept root/jailbreak risk       | Platform-level compromise cannot be fully mitigated at app layer; minimize stored data instead                       |
