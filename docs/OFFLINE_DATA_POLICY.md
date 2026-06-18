# Offline Data Policy

## Overview

Morphic is a hosted-shell app that requires network connectivity for core functionality (AI search, real-time results, auth). However, selective offline behavior improves UX for common scenarios.

## Data Classification

All local storage keys are classified via `lib/local/local-data-classification.ts`:

| Class                 | Persistence                  | Cleared on Logout | Example                             |
| --------------------- | ---------------------------- | ----------------- | ----------------------------------- |
| `safe_preference`     | Permanent (device-level)     | No                | theme, sidebar state                |
| `user_draft`          | Until sent or deleted        | Yes               | search draft, feedback draft        |
| `cacheable_metadata`  | Time-limited (stale-labeled) | Yes               | model list, discovery cache         |
| `sensitive_forbidden` | Never stored locally         | N/A               | auth tokens, API keys, chat history |

### Deny-by-Default

Any key not explicitly registered in the data registry is classified as `sensitive_forbidden`. This prevents accidental storage of sensitive data.

## Safe Offline Candidates

| Data                    | Class              | Max Age | Notes                                |
| ----------------------- | ------------------ | ------- | ------------------------------------ |
| Theme preference        | safe_preference    | —       | Device-level, no user content        |
| Sidebar collapsed state | safe_preference    | —       | UX preference only                   |
| Last active tab         | safe_preference    | —       | Navigation state                     |
| Search query draft      | user_draft         | —       | User-typed text, explicitly saveable |
| Feedback draft          | user_draft         | —       | Unsent feedback form content         |
| Available models list   | cacheable_metadata | 1 hour  | Public API data                      |
| Discovery feed metadata | cacheable_metadata | 15 min  | Public content                       |

## Forbidden Offline Storage

| Data                          | Reason                                          |
| ----------------------------- | ----------------------------------------------- |
| Auth tokens / session cookies | Security — managed by Supabase via HTTP cookies |
| AI provider API responses     | Privacy — may contain user-specific content     |
| Private uploads               | Security — user files stay server-side          |
| Raw search/chat history       | Privacy — requires explicit user control        |
| Provider secrets              | Security — never enter the client               |

## Offline UX States

When the app detects offline state (`navigator.onLine === false` or network failure):

1. **"You're offline"** — clear indication that content requires connectivity
2. **"Showing saved copy"** — when viewing cacheable_metadata that is stale but available
3. **"Reconnect to refresh"** — actionable guidance
4. **Drafts survive** — search/feedback drafts persist and can be sent when online

## Draft Lifecycle

```
User types in search box
    ↓
Auto-save draft to localStorage (debounced)
    ↓
User navigates away or closes app
    ↓
On return: draft restored from localStorage
    ↓
User submits search → draft deleted
    OR
User explicitly deletes draft
    OR
User logs out → all drafts cleared
```

## Cache Staleness

Cacheable metadata shows a visual indicator when stale:

- Within max age: render normally
- Past max age: render with "Last updated X ago" label
- Way past max age (>24h): treat as unavailable, show offline state

## Logout Cleanup

On logout, the following are cleared:

- All `user_draft` entries
- All `cacheable_metadata` entries

The following survive logout:

- All `safe_preference` entries (device-level, not user-specific)

## Implementation

- `lib/local/local-data-classification.ts` — classification engine and registry
- `lib/local/drafts.ts` — draft save/load/delete/clear operations
- Session state module (`lib/auth/mobile-session-state.ts`) detects offline state
