# Deep Links

## Overview

Morphic supports deep linking via universal links (iOS) and app links (Android). The deep link system validates incoming URLs against a route allowlist and handles auth-gated routes gracefully.

## Route Authority

Only URLs from allowed hosts with known route patterns are accepted:

| Route          | Auth Required | Description    |
| -------------- | ------------- | -------------- |
| `/`            | No            | Home           |
| `/search`      | No            | Search page    |
| `/search/[id]` | No            | Search result  |
| `/discovery`   | No            | Discovery feed |
| `/library`     | Yes           | Saved items    |
| `/settings`    | Yes           | User settings  |
| `/reader`      | No            | Article reader |
| `/auth/*`      | No            | Auth pages     |

## Allowed Hosts

- `morphic.sh`
- `www.morphic.sh`

All other hosts are rejected.

## Security Constraints

### Scheme Enforcement

Only `https://` deep links are accepted. `http://`, custom schemes, and other protocols are rejected.

### Redirect Parameter Stripping

The following query parameters are automatically stripped from deep link URLs to prevent open-redirect attacks:

- `redirect`
- `return_to`
- `continue`
- `next`
- `goto`
- `url`

Safe parameters (like `q` for search queries) are preserved.

### Auth-Required Routes

When a deep link targets an auth-required route and the user is not authenticated:

1. The user is redirected to `/auth/login`
2. The original deep link path is preserved in the `next` query parameter
3. After successful login, the user is redirected to the original destination

### Unknown Routes

Deep links to routes not in the allowlist navigate to the home page (`/`). No error is exposed to the user to prevent route enumeration.

## Implementation

The deep link system is implemented in `lib/native/deep-links.ts`:

- `parseDeepLink(url)` — validates URL, host, scheme, route, and strips unsafe params
- `resolveDeepLink(url, { isAuthenticated })` — returns the path to navigate to with auth awareness

## Native Platform Configuration (Future)

Once `/ios/` and `/android/` are committed (Phase 19), the following will be needed:

### iOS (Associated Domains)

```
// ios/App/App.entitlements
com.apple.developer.associated-domains: ["applinks:morphic.sh"]
```

### Android (App Links)

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="morphic.sh" />
</intent-filter>
```

### Apple App Site Association (Server)

```json
// https://morphic.sh/.well-known/apple-app-site-association
{
  "applinks": {
    "apps": [],
    "details": [{ "appID": "TEAM_ID.social.morphic.app", "paths": ["/*"] }]
  }
}
```

### Android Asset Links (Server)

```json
// https://morphic.sh/.well-known/assetlinks.json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "social.morphic.app",
      "sha256_cert_fingerprints": ["..."]
    }
  }
]
```

These server-side files and native project configs are required before deep links will function on real devices. They are deferred to Phase 19 (Commit Native Projects).

## Testing

Deep link parsing and validation is covered by unit tests in `lib/native/__tests__/deep-links.test.ts`.
