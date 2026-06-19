# Store Compliance

## Overview

This document tracks compliance requirements for Apple App Store and Google Play Store submission.

## Privacy & Data Safety

### Data Collected

| Data Type       | Collected              | Linked to Identity       | Purpose                |
| --------------- | ---------------------- | ------------------------ | ---------------------- |
| Email address   | Yes (account creation) | Yes                      | Authentication         |
| Search queries  | Yes (server-side only) | Yes                      | Core functionality     |
| AI responses    | Yes (server-side only) | Yes                      | Core functionality     |
| Usage analytics | Yes (Vercel Analytics) | Yes (when authenticated) | Performance monitoring |
| Crash data      | Yes (redacted)         | No                       | Bug fixing             |
| Device ID       | Future (push tokens)   | No                       | Push notifications     |

### Data NOT Collected

| Data Type                      | Status        |
| ------------------------------ | ------------- |
| Precise location               | Not collected |
| Contact list                   | Not collected |
| Photos/media (unless uploaded) | Not collected |
| Health data                    | Not collected |
| Financial data                 | Not collected |
| Advertising ID                 | Not collected |
| Browsing history outside app   | Not collected |

### Data Sharing

- No data is shared with third-party advertisers
- AI provider (OpenAI, etc.) receives search queries for processing — disclosed in privacy policy
- Vercel Analytics: anonymized usage data

## Account Deletion

### Requirements (Apple + Google)

- Users must be able to delete their account from within the app
- All user data must be deleted within 30 days of request
- Confirmation must be shown before deletion

### Implementation Path

- Settings → Account → Delete Account
- Shows confirmation dialog explaining data deletion scope
- Server-side: delete user record, chat history, saved items, push tokens
- Supabase: `supabase.auth.admin.deleteUser(userId)`

### Current Status

- [ ] Account deletion UI in Settings
- [ ] Server-side deletion endpoint
- [ ] Confirmation dialog with data scope explanation
- [ ] 30-day deletion confirmation email (optional)

## Permissions Rationale

### iOS (Info.plist)

| Permission             | Key                            | Rationale                        | When Requested          |
| ---------------------- | ------------------------------ | -------------------------------- | ----------------------- |
| Push Notifications     | — (entitlement)                | Notify when search results ready | After clear user intent |
| Camera (future)        | NSCameraUsageDescription       | Document scanning for upload     | Before first use        |
| Photo Library (future) | NSPhotoLibraryUsageDescription | Image upload                     | Before first use        |

### Android (AndroidManifest.xml)

| Permission         | Manifest Entry         | Rationale            |
| ------------------ | ---------------------- | -------------------- |
| Internet           | `INTERNET`             | Core functionality   |
| Network State      | `ACCESS_NETWORK_STATE` | Offline detection    |
| Push (Android 13+) | `POST_NOTIFICATIONS`   | Result notifications |

### Permission Philosophy

- Request only what's needed for current functionality
- Request at point of use, never at launch
- Provide clear rationale in the permission dialog
- Degrade gracefully if denied

## AI Disclosure

### Apple Guidelines (4.0.2)

- App must clearly indicate when AI generates content
- Must disclose what AI model/provider is used
- Must not present AI-generated content as human-written

### Implementation (Pending)

- [ ] Search results display "AI-generated" indicator
- [ ] Settings → About shows AI provider information
- [x] No impersonation of specific humans (by architecture — no persona features)

### Google Play Policies

- AI-generated content must be labeled
- Must not generate harmful or misleading content
- Content moderation responsibilities disclosed

## Age Rating

| Store  | Rating                          | Reason                         |
| ------ | ------------------------------- | ------------------------------ |
| Apple  | 12+ (Teen)                      | Unrestricted web search access |
| Google | Everyone (with content warning) | AI search results              |

## Review Notes for Submission

### For Apple Review Team

```
Morphic is an AI-powered search engine that runs entirely via hosted WebView.

Architecture:
- Native shell loads https://morphic.sh in a WKWebView
- No local data processing — all AI/search runs server-side
- Authentication via Supabase (cookie-based, standard web auth)

Testing credentials:
- Email: [test account email]
- Password: [test account password]

The app requires network connectivity for all functionality.
Offline mode shows a clear "You're offline" message.
```

### For Google Play Review Team

```
Morphic is an AI-powered search app using a hosted WebView architecture.

Key points:
- WebView loads https://morphic.sh (our controlled server)
- No third-party content injection
- All permissions justified (Internet for core function, notifications for alerts)
- Account deletion available in Settings

Data collection summary:
- Email: collected for authentication (linked to identity)
- Search queries + AI responses: processed server-side (linked to identity)
- Usage analytics: via Vercel Analytics (linked when authenticated)
- Crash data: collected with PII redaction (not linked to identity)
- Device tokens: for push notifications when enabled (not linked to identity)

No data shared with advertisers.
AI provider receives queries for processing (disclosed in privacy policy).
```

## Store Listing Assets (Future)

When ready for submission:

```
store/
├── ios/
│   ├── screenshots/
│   │   ├── iphone-6.5-search.png
│   │   ├── iphone-6.5-results.png
│   │   ├── iphone-6.5-discovery.png
│   │   └── iphone-6.7-search.png
│   ├── app-icon-1024.png
│   ├── description.txt
│   ├── keywords.txt
│   └── release-notes.txt
└── android/
    ├── screenshots/
    │   ├── phone-search.png
    │   ├── phone-results.png
    │   └── phone-discovery.png
    ├── feature-graphic-1024x500.png
    ├── short-description.txt (80 chars max)
    ├── full-description.txt (4000 chars max)
    └── release-notes.txt (500 chars max)
```

## Compliance Checklist

- [ ] Privacy policy URL accessible from app and store listing
- [ ] Terms of service URL accessible
- [ ] Account deletion functional
- [ ] Age rating declared correctly
- [ ] All permissions have rationale strings
- [ ] AI disclosure visible in app
- [ ] Data safety form completed (Google)
- [ ] Privacy nutrition labels completed (Apple)
- [ ] Screenshots match current app
- [ ] App description accurate
- [ ] Review notes prepared with test credentials
- [ ] Content moderation documented
