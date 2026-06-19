# Observability and Privacy Policy

## Overview

Morphic collects minimal telemetry for crash debugging and performance monitoring. All telemetry is subject to strict privacy redaction before leaving the client.

## Allowed Telemetry

| Data                          | Example                       | Purpose                                  |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| App version                   | `1.4.0`                       | Identify which build has issues          |
| Platform                      | `ios`, `android`, `web`       | Platform-specific debugging              |
| Runtime kind                  | `capacitor`, `pwa`, `browser` | Environment context                      |
| Route class                   | `/search/[id]`, `/discovery`  | Where errors occur (no dynamic segments) |
| Network class                 | `online`, `offline`           | Connectivity context                     |
| Error type/message (redacted) | `TypeError: Cannot read...`   | What went wrong                          |
| Stack trace (redacted)        | File + line number            | Where in code                            |

## Forbidden Telemetry

| Data                           | Reason                                    |
| ------------------------------ | ----------------------------------------- |
| Raw search queries             | User privacy — query content is private   |
| Chat/AI response content       | Provider privacy + user privacy           |
| Auth tokens                    | Security — could enable account takeover  |
| API provider keys              | Security — should never reach client      |
| User email / PII               | Privacy — no PII in error reports         |
| Uploaded file content          | Privacy — user-controlled data            |
| Full URL with dynamic segments | Privacy — may contain user IDs or content |
| IP addresses                   | Privacy — network identity                |

## Redaction Pipeline

All telemetry passes through `lib/telemetry/redaction.ts` before transmission:

```
Error occurs
    ↓
Error boundary catches it
    ↓
redactSensitiveData(errorMessage)     → strips API keys, tokens, emails, IPs
classifyRoute(pathname)               → converts /search/abc123 → /search/[id]
buildCrashMetadata({version, platform, ...})
    ↓
Safe telemetry payload sent
```

## Redaction Patterns

| Pattern                | Replaced With        |
| ---------------------- | -------------------- |
| `sk-[a-zA-Z0-9]{10,}`  | `[REDACTED_API_KEY]` |
| `key-[a-zA-Z0-9]{10,}` | `[REDACTED_KEY]`     |
| `Bearer [token]`       | `Bearer [REDACTED]`  |
| Email addresses        | `[REDACTED_EMAIL]`   |
| Sensitive URL params   | `param=[REDACTED]`   |
| UUIDs                  | `[UUID]`             |
| Home directory paths   | `/Users/[REDACTED]`  |
| IP addresses           | `[IP]`               |

## Route Classification

Routes are classified to prevent user-specific data in metrics:

| Actual Path       | Classified As    |
| ----------------- | ---------------- |
| `/`               | `/home`          |
| `/search/abc123`  | `/search/[id]`   |
| `/auth/login`     | `/auth/[action]` |
| `/admin/anything` | `/[other]`       |

## Error Boundary Strategy

The app uses React error boundaries to:

1. Catch unhandled errors in the component tree
2. Redact sensitive data from error messages
3. Report safe metadata (version, platform, route class)
4. Display a user-friendly error UI with retry option

## User-Facing Diagnostics (Future)

When implemented, a diagnostics screen will allow users to:

- View their app version, platform, and build info
- Export a sanitized diagnostic report for support
- See recent error count (no error content)
- Verify network connectivity

## What This Document Does NOT Authorize

- Sending full URL paths with user IDs to external services
- Logging search queries or AI responses to any telemetry backend
- Collecting device fingerprints or advertising identifiers
- Sharing telemetry data with third parties beyond the crash reporting service
