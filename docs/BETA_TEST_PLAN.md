# Beta Test Plan

## Overview

This document defines the beta testing plan for Morphic's native mobile app before public release.

## Supported Device Matrix

### iOS

| Device                           | OS Version | Priority |
| -------------------------------- | ---------- | -------- |
| iPhone 15/16 (latest)            | iOS 18     | P0       |
| iPhone 13/14 (previous gen)      | iOS 17     | P0       |
| iPhone SE 3rd gen (small screen) | iOS 17+    | P1       |
| iPad (any, mobile mode)          | iPadOS 17+ | P2       |

### Android

| Device                              | OS Version  | Priority |
| ----------------------------------- | ----------- | -------- |
| Pixel 8/9 (reference)               | Android 15  | P0       |
| Samsung Galaxy S24/S25              | Android 14+ | P0       |
| Pixel 6/7 (older gen)               | Android 13+ | P1       |
| Samsung Galaxy A-series (mid-range) | Android 13+ | P1       |

### Desktop/PWA

| Browser          | Priority |
| ---------------- | -------- |
| Chrome (latest)  | P0       |
| Safari (latest)  | P0       |
| Firefox (latest) | P1       |

## Core Flow Checklist

### Account Creation / Login

- [ ] Email/password signup completes
- [ ] Google OAuth login works
- [ ] Email verification link works
- [ ] Password reset flow completes
- [ ] Session persists across app restart

### Search

- [ ] New search submits and returns results
- [ ] Results render correctly (text, links, citations)
- [ ] Search history is saved
- [ ] Previous search loads by ID
- [ ] Long search queries don't overflow UI

### Result Interaction

- [ ] Source links open in system browser
- [ ] Share button shares result link
- [ ] Copy to clipboard works
- [ ] Result detail view renders fully

### Navigation

- [ ] Tab bar switches between sections
- [ ] Back button returns to previous page
- [ ] Deep links from outside app open correct page
- [ ] Scroll position restored on back navigation

### Library / Saved Items

- [ ] Items appear in library when saved
- [ ] Items can be removed
- [ ] Empty state shows when no items

### Settings

- [ ] Theme toggle works (light/dark/system)
- [ ] Account info displays correctly
- [ ] Logout clears session and returns to login

### Offline / Poor Network

- [ ] Offline state shows appropriate message
- [ ] App does not crash when network drops
- [ ] Recovers gracefully when network returns
- [ ] Drafts survive offline → online transition

### Accessibility

- [ ] VoiceOver (iOS) / TalkBack (Android) can navigate
- [ ] Text scales with system font size setting
- [ ] Color contrast meets WCAG AA
- [ ] Touch targets are at least 44×44pt (iOS) / 48×48dp (Android)

## Known Limitations (Document for Testers)

- Push notifications not yet active (Phase 15 architecture only)
- Deep links require universal link setup (Phase 19 native commit)
- Offline: only settings/drafts survive; search requires network
- No biometric authentication yet
- No secure storage yet (Phase 18 threat model only)

## Feedback Collection

### Channels

- In-app feedback modal (existing FeedbackModal component)
- GitHub Issues (for structured bug reports)
- Crash reports via telemetry (when observability is active)

### Bug Report Template

```
Device:
OS Version:
App Version:
Steps to reproduce:
1. ...
2. ...
3. ...
Expected:
Actual:
Screenshot/recording: (if applicable)
```

## Build / Version Policy

- Beta builds use TestFlight (iOS) and Play Internal Testing (Android)
- Version: matches `package.json` version
- Build number: `YYYYMMDD##` format (per RELEASE_ENGINEERING.md)
- Each beta build includes the build number in Settings → About
- Minimum 3 beta builds before store submission

## Success Criteria for Beta Exit

- [ ] All P0 device/OS combinations tested
- [ ] All core flow checklist items pass on iOS and Android
- [ ] No P0/P1 crashes in 7 consecutive days
- [ ] Crash-free rate > 99% across beta testers
- [ ] All reported P0 bugs fixed
- [ ] Feedback from at least 10 unique testers collected
- [ ] Accessibility audit completed on primary flows
