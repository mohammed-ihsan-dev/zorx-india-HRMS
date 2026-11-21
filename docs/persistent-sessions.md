# Persistent sign-in and attendance-first start-up

Internal notes for whoever maintains ZORX INDIA HRMS.

## How sign-in works

| Piece | Where | Lifetime |
|---|---|---|
| Access token (JWT, `typ: "access"`, carries the session id `sid`) | Browser **memory** only (`client/src/services/session.js`) | 15 min (`ACCESS_TOKEN_TTL`) |
| Refresh token `<sessionId>.<random 32 bytes>` | httpOnly cookie `zorx_rt`, `Secure`, `SameSite=Strict`, `Path=/api/auth`, host `api.zorxindia.online` | Until the session ends |
| Session record | MongoDB `authsessions` (hash of the refresh secret only) | At most 30 days from the password being entered (`SESSION_MAX_DAYS`), never extended |
| "This browser has a session" flag | `localStorage.zorx_session = "1"` (no secret) | Until logout or the session ends |

- **Login** (`POST /api/auth/login`, the app sends `X-ZORX-Client: session`) creates a session, sets the cookie and returns the access token and the user.
- **Opening the app** calls `POST /api/auth/refresh?include=today`. This rotates the refresh token and returns a new access token, the user, and today's attendance and WFH status. Check-in/Check-out is usable after this one request.
- **API calls** use the in-memory access token. It is renewed a minute before it expires, and again after a `401 TOKEN_EXPIRED`, which retries the call once.
- **Several tabs**: one refresh at a time per browser (Web Locks). New tokens and logouts are shared with the other tabs (BroadcastChannel).
- **Rotation and reuse detection**: each refresh replaces the secret. The secret it just replaced is accepted for 20 s, which covers two tabs refreshing together. Any older secret means a replayed cookie, and the whole session is revoked.
- **CSRF**: the cookie is `SameSite=Strict`, and `www.zorxindia.online` → `api.zorxindia.online` counts as same-site. The cookie endpoints also need the `X-ZORX-CSRF: 1` header, which forces a CORS preflight, and an allowed `Origin`.

### What ends a session

| Event | Effect |
|---|---|
| Logout (`POST /auth/logout`) | Revokes this browser's session. The other tabs are signed out at once. |
| Sign out on all devices (`POST /auth/logout-all`, Settings → Security) | Revokes every session. Sets `User.sessionsRevokedAt`, so every access token and legacy token already issued is refused. |
| Password reset (email OTP) | Revokes every session (as before, `passwordChangedAt` also refuses older tokens). |
| Password change | Other devices are signed out; this one stays signed in. |
| Employee deactivated | Every session is revoked. Each request also re-checks the account status. |
| 30 days after sign-in | `/auth/refresh` returns `401 SESSION_ENDED` and the login page is shown. |

A revoked session's access token stays usable for at most its remaining 15 minutes. The browser that logged out discards its token at once. Deactivation and password reset take effect on the very next request, because each request re-checks the account.

### Older app versions (cached PWA)

- An app version from before this change sends no `X-ZORX-Client` header. It still receives the 8-hour bearer token it understands (`LEGACY_LOGIN_TOKENS=true`).
- When such a user updates, a still-valid saved token (`localStorage.zorx_token`) is moved once to a persistent session via `POST /auth/session/upgrade`. The session counts from when that token was issued. An expired token is never upgraded and needs a normal login. The saved token is then deleted.
- Once everyone has updated, set `LEGACY_LOGIN_TOKENS=false` on Render.

### Known browser limit

`api.zorxindia.online` is a CNAME to `onrender.com`. Safari (iOS and macOS) caps cookies set through such hosts at **7 days**. The cookie is set again on every refresh (each time the app is opened), so this only matters for someone who does not open the app for a week. They will then need to sign in once.

## Speed: where the time went and what changed

The API runs on Render Free in **Oregon (US West)**; MongoDB Atlas is in **Mumbai (AWS ap-south-1)**. Every database query that waits for the previous one costs about 230 ms. Most of the slowness came from queries made one after another.

`server/scripts/perf/dbLatencyBench.mjs` runs the real API against an in-memory database behind a proxy that adds a 230 ms round trip. It never touches a real database. Median of 5 runs:

| | Before | After |
|---|---|---|
| Server start-up (before the port opens) | 5,469 ms | 247 ms |
| Restore session on opening the app | 476 ms (`/auth/me`) | 722 ms, **including today's attendance** (before: a separate 714 ms call) |
| `GET /auth/me` | 475 ms | 4 ms |
| `GET /attendance/me/today` | 714 ms | 243 ms |
| `POST /attendance/check-in` | 3,077 ms | 483 ms |
| `POST /attendance/check-out` | 3,070 ms | 486 ms |

The changes:
- **Sign-in check on every request:** User and Employee are read in parallel. A 15-second cache of the account (`principalCache.js`) is cleared by every write through Mongoose. Each request gets its own copy.
- **Office Settings:** a 30-second cache, cleared by every write.
- **Check-in:** the WFH lookup is made once per request instead of twice, and the loaded employee record is reused. The write is one atomic upsert, which the unique `(employeeId, date)` index protects against duplicates.
- **Check-out:** today's record is read in parallel with the location checks. The write only succeeds if the record is still checked in with the same breaks, so a retry can never overwrite the first check-out time.
- **Start-up:** the port opens at once, and API requests wait for MongoDB (up to 30 s, then a clear `503 SERVER_STARTING`). Collection creation and the PressD migration run in the background.
- **Tracing:** each response has `X-Request-Id` (Cloudflare's ray id when present) and `Server-Timing`. The Render log line ends with `rid=…`. Headers, bodies, tokens and cookies are never logged.

### Free-hosting limits that remain

- Render Free still sleeps after about 15 minutes without traffic. The first request afterwards waits for Render to start the instance, about 25–30 s, which code cannot remove. The app shows "Connecting to the server…" and retries by itself.
- **Biggest remaining gain, still free:** move the Render service to **Singapore** to sit next to Atlas Mumbai. This needs a new free Render web service in that region, its environment variables copied, and the `api` DNS record pointed at it. Every query would drop from about 230 ms to about 60 ms. It can only be done from the Render and DNS dashboards.

## Deploy

1. Merge to `main`. Render (API) and Vercel (app) deploy automatically.
2. No database migration is needed. The `authsessions` collection and the new indexes (`employees.userId`, the session TTL index) are created automatically.
3. Check after the deploy:
   - `curl https://api.zorxindia.online/api/version` shows the new commit.
   - Sign in on a phone, close the browser, reopen it: no login page.
   - Check-in works.

## Rollback

Revert the merge commit on `main` and push. Render and Vercel redeploy the previous version.

- Sessions created meanwhile simply stop being used. The old app reads `localStorage.zorx_token`, which the new app removes, so affected users sign in once more.
- No data needs restoring. The `authsessions` collection can be dropped, or left for its TTL index to clean up.
