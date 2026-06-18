# Push Notification Architecture

## Overview

This document defines the push notification architecture for Morphic's mobile native shell. It establishes the design contract before any Capacitor push plugin is installed.

**Status:** Architecture phase only. No push plugin is installed yet.

## Principles

1. **No push token survives logout** — tokens must be deleted server-side on logout
2. **No sensitive content in previews** — lock-screen notifications show generic text by default
3. **Permission is asked after clear intent** — never on first launch
4. **Users control categories** — per-category enable/disable
5. **Server handles stale tokens** — expired/rotated tokens are cleaned up automatically

---

## Notification Categories

| Category           | Description                     | Default | Preview Content                        |
| ------------------ | ------------------------------- | ------- | -------------------------------------- |
| `search_complete`  | Search/research result is ready | On      | "Your search is ready" (no query text) |
| `saved_update`     | Saved item has new information  | On      | "A saved item was updated"             |
| `system_alert`     | Provider outage, maintenance    | On      | Generic system message                 |
| `account_security` | Password change, new login      | On      | "Security alert"                       |

### Privacy-Safe Previews

By default, notification previews contain only category-level descriptions. No user-specific content (search queries, chat content, saved article titles) appears on the lock screen unless the user explicitly enables "Detailed Previews" in settings.

---

## Permission UX

### When to Ask

- **Never on first launch** — let the user explore the app first
- **After clear user intent** — ask only when the user performs an action that would benefit from notifications:
  - After saving their first search result
  - After enabling a specific notification category in settings
  - After explicitly tapping "Enable notifications" in a prompt

### Permission Flow

```
User saves first result
     ↓
App shows soft prompt: "Get notified when results are ready?"
     ↓ (user taps "Enable")
System permission dialog appears
     ↓ (user grants)
Token registered with server
     ↓
Notifications active for default categories
```

If the user denies the system permission, respect it. Do not re-prompt until the next clear intent signal (e.g., visiting notification settings).

---

## Token Lifecycle

### Registration

```
1. User grants push permission
2. Capacitor Push plugin requests token from APNs (iOS) / FCM (Android)
3. Client sends token + device ID + platform to server
4. Server stores: { userId, token, platform, deviceId, createdAt, lastUsedAt }
```

### Rotation

APNs/FCM tokens can rotate without user action. When a new token is received:

```
1. Client receives didRegister/tokenRefresh event
2. Client sends new token to server
3. Server replaces old token for this device ID
4. Old token is deleted
```

### Deletion

Tokens are deleted in these scenarios:

- **Logout:** client calls DELETE /api/push-token before clearing session
- **Account deletion:** server deletes all tokens for the user
- **Device removal:** user removes a device from settings
- **Stale token:** server marks token as stale after 3 consecutive delivery failures

### Stale Token Handling

When a push delivery fails:

```
1. Server increments failure count for the token
2. After 3 consecutive failures: mark token as stale
3. Stale tokens are excluded from future sends
4. After 30 days stale: delete the token record
5. If the device reconnects and re-registers, clear the failure count
```

---

## Server-Side Data Model

```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE, -- globally unique: prevents cross-user token leakage
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failure_count INTEGER NOT NULL DEFAULT 0,
  stale_at TIMESTAMPTZ,
  UNIQUE (user_id, device_id)
);

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  detailed_preview BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, category)
);
```

---

## API Endpoints (Future)

| Method | Path                            | Description                           |
| ------ | ------------------------------- | ------------------------------------- |
| POST   | `/api/push-token`               | Register or update a push token       |
| DELETE | `/api/push-token`               | Delete token on logout/device removal |
| GET    | `/api/notification-preferences` | Get user's category preferences       |
| PUT    | `/api/notification-preferences` | Update category enable/disable        |

---

## Client-Side Architecture (Future)

When the push plugin is added:

```
lib/native/push-notifications.ts
├── requestPermission()      — soft prompt → system dialog → register
├── registerToken()          — send token to server
├── deleteToken()            — call on logout
├── handleTokenRefresh()     — re-register on rotation
├── handleNotificationReceived() — in-app notification handling
└── handleNotificationTap()  — deep-link navigation from notification
```

All functions will:

- No-op safely on web/browser (push is native-only for now)
- Use the Capacitor global bridge pattern (no static plugin imports)
- Respect notification preferences before showing in-app notifications
- Route notification taps through the deep-link parser (`lib/native/deep-links.ts`)

---

## Integration Points

- **Deep Links (Phase 14):** Notification taps route through `resolveDeepLink()`
- **Auth (Phase 13):** Token deletion on logout via `deleteToken()`
- **Session State:** No push registration until user is authenticated
- **Native Safety:** Push plugin must be added to the approved plugins table in `docs/NATIVE_SAFETY.md`

---

## What This Document Does NOT Authorize

- Installing `@capacitor/push-notifications` (needs implementation phase)
- Creating the database tables (needs migration)
- Building the notification preference UI (needs design)
- Sending actual push notifications (needs server-side infrastructure)

These come after this architecture is reviewed and accepted.

---

## Capacitor Plugin Requirements (When Ready)

**Plugin:** `@capacitor/push-notifications`

**iOS Permissions:**

- `NSUserNotificationsUsageDescription` in Info.plist
- Remote notification capability in entitlements
- APNs certificate or key in App Store Connect

**Android Permissions:**

- `POST_NOTIFICATIONS` permission (Android 13+)
- FCM configuration in `google-services.json`

**Both:**

- Must be added to `docs/NATIVE_SAFETY.md` plugin allowlist
- Must pass the 7-point plugin review (reason, permissions, data flow, privacy risk, fallback, tests, docs update)
