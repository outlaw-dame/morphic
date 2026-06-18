# Mobile Auth and Session Reliability

## Architecture

Morphic uses a **hosted Capacitor shell** pointing at `https://morphic.sh`. Authentication is handled entirely by the hosted web app via Supabase cookie-based sessions. The native shell does not participate in authentication.

## Principles

1. **Hosted app is source of truth** — all auth state lives in Supabase-managed HTTP cookies
2. **No native storage of tokens** — no auth tokens, refresh tokens, or session data in Capacitor Preferences/Keychain
3. **No API keys in app bundle** — secrets remain on the server
4. **Cookie persistence** — the WebView must preserve cookies across app restarts (default behavior for WKWebView/Android WebView)
5. **External auth opens safely** — OAuth redirects use the system browser only for approved origins

## Session Flow in WebView

```
App Launch → WebView loads https://morphic.sh
                    ↓
        Middleware calls supabase.auth.getUser()
                    ↓
           Cookie valid? → Serve authenticated content
                    ↓ (no)
           Cookie expired/missing? → Redirect to /auth/login
                    ↓
           User logs in (email/password or Google OAuth)
                    ↓
           Server sets session cookies
                    ↓
           App resumes with authenticated state
```

## OAuth in WebView

Google OAuth uses Supabase's `signInWithOAuth()` with `redirectTo: origin + '/auth/oauth'`.

In the hosted shell, `location.origin` resolves to `https://morphic.sh`, which is correct. The OAuth callback at `/auth/oauth` exchanges the PKCE code for a session and redirects back to the app.

**Security constraint:** The `redirectTo` parameter must only point to allowed app origins. The `isAllowedAuthRedirect()` function in `lib/native/open-url.ts` validates this.

## Session State UX

The `lib/auth/mobile-session-state.ts` module provides session-state awareness:

| State             | Condition                  | UX                                  |
| ----------------- | -------------------------- | ----------------------------------- |
| `authenticated`   | User present, online       | Normal app usage                    |
| `unauthenticated` | No user, online            | Show login prompt                   |
| `expired`         | API returns 401            | Show "session expired" + login link |
| `offline`         | navigator.onLine === false | Show offline state + retry          |

## External URL Policy

All external URL opening goes through `lib/native/open-url.ts`:

- **Blocked:** `javascript:`, `data:`, `file:`, `blob:`, `vbscript:`
- **Allowed external:** `https:`, `http:`, `mailto:`, `tel:`
- **Internal (stays in WebView):** Any URL on `morphic.sh` / `www.morphic.sh`
- **Capacitor:** Opens system browser via Browser plugin bridge
- **Web:** Opens new tab via `window.open`

## Logout Behavior

On logout:

1. Supabase `auth.signOut()` is called
2. Server clears session cookies
3. Middleware will redirect to login on next navigation
4. **No native storage to clean up** (by design)

## What This Does NOT Cover Yet

- Push notification token cleanup on logout (Phase 15)
- Secure storage threat model (Phase 18)
- Offline session caching (Phase 17)
- Biometric re-authentication (future)
