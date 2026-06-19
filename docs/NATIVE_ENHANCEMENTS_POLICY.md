# Selective Native Enhancements Policy

## Principle

**Do not add native plugins just because Capacitor makes them available.**

Every native capability must be justified through a formal review process before installation.

## 7-Point Plugin Review

Before adding ANY Capacitor plugin, it must pass all 7 criteria:

### 1. Reason

- What user problem does this solve?
- Why can't it be solved with web APIs alone?
- Is this a P0 requirement or a nice-to-have?

### 2. Permissions

- What OS permissions does it require?
- iOS: What Info.plist keys are needed?
- Android: What manifest permissions are needed?
- Are these permissions reasonable for the stated purpose?

### 3. Data Flow

- What data enters the plugin?
- What data leaves the plugin?
- Does any user data flow to third-party servers?
- Is the data flow documented?

### 4. Privacy Risk

- Does it access sensitive hardware (camera, microphone, location)?
- Does it store data outside app sandbox?
- Could it be used for user tracking?
- Is user consent required?

### 5. Fallback Behavior

- What happens on web/browser (no plugin)?
- What happens if permission is denied?
- Does the app still function without it?
- Is the fallback UX acceptable?

### 6. Tests or Manual QA Checklist

- Are there automated tests for the wrapper module?
- Is there a manual QA checklist for device testing?
- Are browser fallback paths tested?
- Are permission denial paths tested?

### 7. docs/NATIVE_SAFETY.md Update

- Is the plugin added to the approved plugins table?
- Are its permissions documented?
- Is the rationale recorded?

---

## Enhancement Candidates

### Approved for Future Implementation

| Enhancement        | Phase          | Status                            | Justification                      |
| ------------------ | -------------- | --------------------------------- | ---------------------------------- |
| Push Notifications | 15             | Architecture done                 | Users need result-ready alerts     |
| Deep Links         | 14             | Logic done, native config pending | Required for URL-based app opening |
| Haptics            | Already active | ✅ Implemented                    | Native touch feedback              |
| Share              | Already active | ✅ Implemented                    | OS share sheet integration         |
| Status Bar         | Future         | Not started                       | Needed for immersive full-screen   |

### Deferred (Requires Additional Justification)

| Enhancement              | Reason for Deferral                       |
| ------------------------ | ----------------------------------------- |
| Background Refresh       | No offline-first architecture yet         |
| Biometric Auth           | Secure storage threat model needed first  |
| Camera                   | No camera-dependent feature exists        |
| Geolocation              | No location-based feature exists          |
| File System              | Server-side file management sufficient    |
| In-App Browser           | system browser via open-url is sufficient |
| Widgets                  | Low priority, complex native config       |
| App Clips / Instant Apps | Premature optimization                    |

### Explicitly Rejected

| Enhancement                          | Reason                              |
| ------------------------------------ | ----------------------------------- |
| Advertising ID plugins               | Against privacy policy              |
| Analytics plugins with user tracking | Conflicts with privacy policy       |
| Social login plugins (native SDKs)   | Web OAuth is sufficient and simpler |
| Device fingerprinting                | Privacy violation                   |

---

## Currently Approved Plugins

| Plugin                              | Version | Reason       | Approved Date |
| ----------------------------------- | ------- | ------------ | ------------- |
| _(@capacitor/core, /ios, /android)_ | ^8.4.0  | Base runtime | 2026-06-17    |
| _(No additional plugins yet)_       | —       | —            | —             |

---

## How to Propose a New Enhancement

1. Open a GitHub Issue with title: `[Native Enhancement] <plugin name>`
2. Fill in all 7 criteria from the review process above
3. Tag with `native-enhancement` label
4. Obtain review approval from at least one team member
5. Only then create the implementation PR
6. PR must include:
   - Wrapper module in `lib/native/`
   - Tests for browser fallback
   - NATIVE_SAFETY.md plugin table update
   - Capacitor config update (if needed)

---

## Integration Contracts

All native enhancements must follow these rules (from NATIVE_RUNTIME_ARCHITECTURE.md):

1. No direct `@capacitor/*` plugin imports in UI components
2. All access through `lib/native/` semantic bridge modules
3. Every function no-ops safely on web/SSR
4. Sensitive data rejected unless explicitly allowed
5. Reduced-motion preference respected for animations/haptics
6. User permission requested at point of use, never at launch
