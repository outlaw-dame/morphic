# Native Share and File Policy

## Share Policy

### What Can Be Shared

| Content                 | Allowed | Notes                            |
| ----------------------- | ------- | -------------------------------- |
| Search result links     | ✅      | `https://morphic.sh/search/{id}` |
| Discovery article links | ✅      | Public HTTPS URLs                |
| Plain text summaries    | ✅      | Truncated to 2000 chars          |
| External HTTPS URLs     | ✅      | From search results              |

### What Cannot Be Shared

| Content                                 | Blocked | Reason                                         |
| --------------------------------------- | ------- | ---------------------------------------------- |
| Raw search queries with private context | ❌      | Privacy — user may not want query text exposed |
| Auth tokens / API keys                  | ❌      | Detected and blocked by pattern matching       |
| Passwords or secrets                    | ❌      | Pattern-matched                                |
| Non-HTTPS URLs                          | ❌      | Security                                       |
| URLs with sensitive query params        | ❌      | token, access_token, api_key, secret, password |

### Validation

All share content passes through `lib/native/share-policy.ts`:

- `validateShareContent()` — checks for forbidden patterns, validates URLs, truncates text
- `buildSearchShareUrl()` — creates safe public share URL for a search result
- `buildSearchShareData()` — creates complete share data with sanitized title

## File Policy

### Allowed Upload Types

| Category    | MIME Types                                                         |
| ----------- | ------------------------------------------------------------------ |
| Documents   | `application/pdf`, `text/plain`, `text/markdown`, `text/csv`       |
| Images      | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif` |
| Web content | `text/html`                                                        |

### Constraints

- **Maximum file size:** 20 MB
- **Empty files:** Rejected
- **Blocked types:** JavaScript, executables, shell scripts

### Blocked Types

- `application/javascript`
- `text/javascript`
- `application/x-executable`
- `application/x-msdownload`
- `application/x-sh`
- `application/x-shellscript`

### Metadata Stripping

When files are uploaded, the server should strip EXIF/metadata from images before storage. This is a server-side concern documented here for completeness.

## External URL Policy

External URLs are governed by `lib/native/open-url.ts`:

- Internal links stay in WebView
- External HTTPS links open in system browser (Capacitor) or new tab (web)
- Dangerous schemes (`javascript:`, `data:`, `file:`, `blob:`) are blocked
- Protocol-relative URLs (`//evil.com`, `/\evil.com`) are rejected

## Incoming Share Target (Future)

When the app registers as a share target (Phase 19+):

1. Accept: URLs, plain text
2. Validate through `validateShareContent()` before processing
3. Files: validate through `validateFile()` before upload
4. Route shared content to appropriate app flow (new search, reader, etc.)
