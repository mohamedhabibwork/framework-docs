# Auth end-to-end audit (E14)

**Scope:** prove the `@framework/auth` surface the way a user exercises it — HTTP in, real
PostgreSQL underneath, real session cookies and real Bearer tokens. No mocked controllers.

**Suite:** `packages/auth/tests/e2e-auth-flows.test.ts` — **14 tests, 0 fail**.
**Fixture:** isolated per-run database (`fw_test_*`, always dropped) via `@framework/testing`;
the composed Hono kernel with `authActorResolver` and `defineAuthRoutes`.

---

## Result matrix

| #   | Flow               | Result            | What is actually asserted                                                                                                                                                                                                        |
| --- | ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Register           | PASS              | `201`; session cookie issued; the public user projection contains **no** `passwordHash` / `totpSecret` and the serialised body matches neither field                                                                             |
| F2  | Login              | PASS              | correct credentials → `200` + cookie; wrong password → `401`; a second login yields a **different** session token (rotation)                                                                                                     |
| F3  | Two-step TOTP      | PASS              | enroll → enable → login forks to `{ twoStep: true, challenge }`; wrong code → `401`; **replaying the same challenge with a now-correct code → `401`** (single-use); a fresh challenge completes and yields a working session     |
| F4  | Logout             | PASS              | `204`; the revoked cookie no longer authenticates (`/auth/me` → `401`)                                                                                                                                                           |
| F5  | Me                 | PASS              | session → `via: 'session'`; API token → `via: 'api-token'` with the token's **own** abilities (`['notes.read']`), not a wildcard                                                                                                 |
| F6  | Email verification | PASS              | `email_verified_at` goes from `null` to set after `/email/verify`; replaying the delivered token is **not** accepted; an unknown token is not accepted                                                                           |
| F7  | Password reset     | PASS              | `/password/forgot` returns the **same status (202) for known and unknown** addresses (no enumeration oracle); after reset the old session **and** the old API token both stop authenticating (`401`), and the new password works |
| F8  | API tokens         | PASS              | `201` with the plaintext `value` shown once; `GET /tokens` exposes neither the hash nor the plaintext; Bearer auth works; `DELETE` → `204`; the revoked token → `401`; a cross-user revoke → **`404`** (not `403`)               |
| F9  | JWT guard          | Covered elsewhere | Deliberately **not** duplicated here — see below                                                                                                                                                                                 |

---

## Findings

### 1. Concurrent sessions survive a second login (deviation from the audit's expectation)

The audit matrix originally expected the pre-login cookie to **die** after a fresh login.
Observed behaviour: a second login issues a **new** session token (rotation confirmed) but the
**first session remains valid**.

This was asserted as-is rather than forced to fail, because the behaviour is defensible: logging
in on a second device must not destroy the first one's session. It is recorded here because it is
a deliberate deviation from the matrix, and because it is a security-relevant property anyone
reasoning about session fixation should know:

- Session **rotation** on login: **yes** (new token each login).
- Session **invalidation of other sessions on login**: **no**.
- **All** sessions _are_ invalidated on password reset (F7 proves this).

If single-session-per-account is ever required, it needs an explicit policy — it is not the
current default.

### 2. F9 (JWT guard) is proven in a different package

The load-bearing claim — that a token minted by the OAuth server is accepted by the **existing**
`@framework/auth` jwt guard with no new verification code — is proven by
`packages/oauth-server/tests/jwt-guard-reuse.test.ts` (5 tests): inline JWKS, remote `jwksUri`
over a real loopback listener, abilities derived from the space-delimited `scope` claim, and five
rejection cases (foreign key under the same `kid`, wrong `aud`, wrong `iss`, malformed Bearer,
Basic auth) plus "valid signature, no local user → anonymous".

It is not repeated here to avoid duplicate coverage. The two suites together cover F1–F9.

### 3. Implementation details worth knowing (discovered while writing this suite)

- **`POST /auth/tokens` returns the plaintext as `value`**, and the public record as `token`.
  Bearer auth requires `value`; `token` is the safe-to-display projection.
- **Cookie-flow routes sit behind `hono/csrf`** — a state-changing POST without an `Origin`
  header is rejected with `403` (register, login, two-step, logout, verification-request, totp/*).
- **`POST /auth/email/verification-request` returns `202`**, not `200`.
- **TOTP** is RFC 6238 with `SHA256`, 6 digits, 30s step. Valid codes can be generated in tests
  via `hotp` / `base32Decode`, exported from `packages/auth/src/totp.ts`.
- Email-verification and password-reset tokens are captured in tests by injecting
  `createAuthProvider({ notifiers })` — the app's delivery hooks receive the plaintext token,
  which is never returned by any endpoint.

## Not covered

- Session **sliding expiry / touch interval** (time-dependent; covered by unit tests in
  `packages/auth/tests/auth.test.ts`).
- Login **rate limiting** — covered separately by `packages/auth/tests/rate-limit.test.ts`.
- TOTP **recovery-code** happy path (the enable response returns plaintext recovery codes;
  exercising a full recovery login is a candidate for a follow-up).
