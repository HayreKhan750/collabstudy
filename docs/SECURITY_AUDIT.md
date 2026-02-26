# CollabStudy — Security Audit Report

> **Phase 12.5** | Date: 2026-02-26 | Auditor: Internal Engineering (Staff-Level Review)
>
> This document covers the automated dependency vulnerability sweep, OWASP Top 10
> code verification, and the penetration test plan for third-party security testing.

---

## Table of Contents

1. [Dependency Vulnerability Audit](#dependency-vulnerability-audit)
2. [OWASP Top 10 Verification](#owasp-top-10-verification)
3. [Penetration Test Plan](#penetration-test-plan)
4. [Security Headers Verification](#security-headers-verification)
5. [Ongoing Security Checklist](#ongoing-security-checklist)

---

## Dependency Vulnerability Audit

**Tool:** `pnpm audit`  
**Date:** 2026-02-26  
**Result:** 4 HIGH advisories — all unactionable transitive dev/build dependencies.

### Findings

| Package | Severity | CVE / Advisory | Vulnerable Range | Path | Actionable? |
|---------|----------|---------------|-----------------|------|-------------|
| `tar` | HIGH | GHSA-r6q2-hw4h-h46w | <=7.5.3 | `bcrypt → @mapbox/node-pre-gyp → tar` | ❌ Dev-only (build native addon) |
| `tar` | HIGH | GHSA-34x7-hfp2-rc4v | <7.5.7 | Same | ❌ Dev-only |
| `tar` | HIGH | GHSA-8qq5-rm4j-mr97 | <=7.5.2 | Same | ❌ Dev-only |
| `tar` | HIGH | GHSA-83g3-92jg-28cx | <7.5.8 | Same | ❌ Dev-only |
| `minimatch` | HIGH | ReDoS via wildcards | <3.1.3 | `eslint → minimatch` | ❌ Dev-only (linter) |

### Risk Assessment

**All findings are unactionable** for the following reasons:

1. **`tar` via `bcrypt → @mapbox/node-pre-gyp`**: `tar` is used exclusively during `npm install` to extract pre-compiled native binaries for `bcrypt`. It is **never executed at application runtime**. The vulnerability requires an attacker to control the contents of a tar archive being extracted — impossible via the npm install vector in a locked deployment. The fix requires `@mapbox/node-pre-gyp` to update their `tar` dependency, which is outside our control.

2. **`minimatch` via `eslint`**: ESLint is a `devDependency` — it is **never bundled or executed in production**. The ReDoS vulnerability requires passing attacker-controlled glob patterns to `minimatch`, which cannot occur via the ESLint integration.

### Resolution

- No runtime dependencies have known vulnerabilities.
- Both issues are pinned deep in the `devDependencies` tree and cannot be directly fixed without a patch in the upstream packages (`@mapbox/node-pre-gyp`, `eslint`).
- **Action:** Monitor upstream for patch releases. Re-run `pnpm audit` on every CI build (already enforced in `.github/workflows/ci.yml`).

---

## OWASP Top 10 Verification

### A01 — Broken Access Control

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| Channel IDOR | `ChannelsService.verifyChannelAccess()` called at the top of every message, reaction, summary, and read-receipt operation. Validates workspace membership before any data is returned. |
| Workspace isolation | `WorkspacesService` verifies membership before listing channels, members, or workspace data. |
| DM isolation | `DirectService` validates that both participants belong to the conversation before returning messages. |
| RBAC on mutations | `RolesGuard` + `@Roles()` decorator enforce OWNER/ADMIN on channel creation, deletion, and workspace management endpoints. |
| Cross-workspace channel access | `verifyChannelAccess` checks `channel.workspace.members` — a channel in workspace A cannot be accessed with a token for workspace B. |

**Spot-check: `GET /channels/:channelId/messages`**
```
1. JwtAuthGuard → validates JWT, extracts userId
2. MessagesService.findAllByChannel(userId, channelId)
3. → channelsService.verifyChannelAccess(userId, channelId)
4. → prisma.channel.findUnique + workspace.members.where(userId)
5. → throws ForbiddenException if userId not in members
```
✅ No IDOR possible.

---

### A02 — Cryptographic Failures

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| Password hashing | `bcrypt` with `saltRounds: 10`. The `passwordHash` field is **never included** in any API response — all user `select` statements explicitly omit it. |
| JWT signing | HS256 with `JWT_SECRET` (minimum 32 chars enforced by `env.validation.ts`). `ignoreExpiration: false` in `JwtStrategy`. |
| API keys in responses | Gemini API key, S3 credentials, Redis password are server-side env vars — never serialized or returned to clients. |
| Sensitive data in logs | All `console.log` statements removed from production code (Phase 12.6 cleanup). Pino logger redacts `authorization`, `cookie`, `password`, `token` fields. |
| HTTPS | Enforced at the infrastructure layer (nginx/load balancer). HSTS header set via Helmet in production. |

---

### A03 — Injection

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| SQL injection | All database queries use Prisma's typed query builder. Raw SQL uses `Prisma.sql` tagged template literals (parameterized — not string concatenation). |
| Raw SQL review | `messages.service.ts` uses `Prisma.sql` template for `editMessage` UPDATE: `Prisma.sql\`UPDATE messages SET content = ${dto.content}, "isEdited" = true...\`` — value is a parameterized bind variable, not concatenated string. ✅ |
| Search queries | `search.service.ts` uses `Prisma.sql` template for pg_trgm and pgvector queries — all user inputs are parameterized. ✅ |
| XSS via stored content | `sanitize.util.ts` strips HTML/script tags from all user-supplied strings via `class-sanitizer` before persistence. |
| Input validation | Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true` rejects unrecognized fields. All DTOs use `class-validator` decorators. |

---

### A04 — Insecure Design

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| Threat modeling | Workspace isolation is the primary security boundary — all data access goes through workspace membership verification. |
| Rate limiting | Auth endpoints: 5 req/min (register), 10 req/min (login). General API: 60 req/min. Upload: 10 req/min. WS: 30 messages/10s. |
| File upload security | `UploadService` validates MIME type and file size. Files stored with UUID names (no original names on disk). |

---

### A05 — Security Misconfiguration

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| Security headers | Helmet configured with full CSP, HSTS (prod), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy. |
| CORS | Production: only `CORS_ORIGIN` env var allowed. Origin-less requests rejected in production. |
| Error messages | NestJS exception filters return standardized error shapes — no stack traces or internal details in production responses. |
| Env validation | `env.validation.ts` fails fast on startup if required vars are missing. `.env` files gitignored. |
| Prometheus | `/metrics` endpoint is `@SkipThrottle` + unauthenticated — **must** be restricted at network level. Document: restrict to internal scraper IP only. |

---

### A06 — Vulnerable and Outdated Components

**Status: ⚠️ MONITORED**

See [Dependency Vulnerability Audit](#dependency-vulnerability-audit) above. All runtime dependencies are clean. Two dev-only advisories are tracked and unactionable at this time.

**Mitigation:** `pnpm audit` runs on every CI build. Dependabot or Renovate should be configured to auto-open PRs for dependency updates.

---

### A07 — Identification and Authentication Failures

**Status: ✅ PASS with noted limitation**

| Check | Finding |
|-------|---------|
| JWT expiration | `ignoreExpiration: false`. Default TTL: 7 days (configurable via `JWT_EXPIRES_IN`). |
| Token blacklisting | ⚠️ **Stateless JWT — no server-side blacklist.** Logout sets `status: OFFLINE` in DB but the token remains cryptographically valid until expiry. This is a known trade-off of stateless JWTs. |
| Brute force protection | Login: 10 attempts/min per user. Register: 5 attempts/min. Both return identical `"Invalid credentials"` message (no username enumeration). |
| Password strength | DTOs enforce minimum 8-character passwords via `@MinLength(8)`. |
| Credential stuffing | Rate limiting + constant-time bcrypt comparison prevent timing attacks. |

**Recommended future improvement:** Implement a Redis-backed token blacklist (store `jti` claim with TTL matching token expiry) to enable immediate session invalidation on logout. Low priority given the 7-day TTL and rate limiting already in place.

---

### A08 — Software and Data Integrity Failures

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| Dependency integrity | `pnpm-lock.yaml` locks all transitive dependency versions. CI uses `--frozen-lockfile`. |
| Docker images | Production images pinned to digest in `docker-compose.prod.yml`. |
| CI/CD pipeline | GitHub Actions with OIDC auth for GHCR — no long-lived credentials in CI. |

---

### A09 — Security Logging and Monitoring Failures

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| Structured logging | Pino JSON logs with request ID, method, path, status, response time. |
| Sensitive field redaction | `authorization`, `cookie`, `password`, `token` redacted from Pino output. |
| Error tracking | Sentry (Phase 12.5) captures all unhandled exceptions with stack traces. |
| Metrics | Prometheus `/metrics` with HTTP error rate, latency, queue depth — alerting thresholds documented in `OBSERVABILITY.md`. |
| Audit trail | All message create/edit/delete operations are persisted with `userId` + timestamp. |

---

### A10 — Server-Side Request Forgery (SSRF)

**Status: ✅ PASS**

| Check | Finding |
|-------|---------|
| User-controlled URLs | No endpoints accept arbitrary user-supplied URLs for server-side fetch. |
| S3 presigned URLs | Generated server-side with AWS SDK — no user input affects the S3 endpoint or bucket. |
| Webhook endpoints | None currently implemented. Future implementations must validate destination URLs against an allowlist. |

---

## Penetration Test Plan

This plan defines the scope and test cases for a third-party security assessment or internal red team exercise.

### Scope

| In Scope | Out of Scope |
|----------|-------------|
| `https://api.collabstudy.com` (API) | Infrastructure provider (AWS, Cloudflare) |
| `https://app.collabstudy.com` (Frontend) | Physical security |
| WebSocket endpoint (`wss://api.collabstudy.com`) | Third-party services (Sentry, Google Gemini) |
| Docker containers (if self-hosted) | |

### Test Categories

#### 1. Authentication & Session Management

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| Brute-force login | Send >10 POST /auth/login requests/min with same IP | 429 Too Many Requests after 10 attempts |
| Credential stuffing | Same with different credentials | Same 429 |
| JWT manipulation | Modify JWT payload, re-sign with wrong secret | 401 Unauthorized |
| JWT expiry bypass | Use expired JWT | 401 Unauthorized |
| Replay attack | Replay a valid token after logout | 200 (stateless JWT — documented limitation) |
| Username enumeration | Verify register/login return identical error for invalid user vs wrong password | Same "Invalid credentials" message |

#### 2. Authorization & IDOR

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| Cross-workspace channel access | Authenticate as User A (Workspace 1), request `GET /channels/:id/messages` for a channel in Workspace 2 | 403 or 404 Forbidden |
| DM conversation access | Request `GET /direct/:conversationId/messages` for a conversation User A is not part of | 403 Forbidden |
| Edit another user's message | `PATCH /channels/:id/messages/:msgId` with a message owned by User B | 403 Forbidden |
| Delete another user's message | `DELETE /channels/:id/messages/:msgId` for User B's message | 403 Forbidden |
| Remove another user's reaction | `DELETE /reactions/:id` for a reaction by User B | 403 Forbidden |
| ADMIN endpoint as MEMBER | `POST /workspaces/:id/channels` as a MEMBER role | 403 Forbidden |
| OWNER endpoint as ADMIN | `DELETE /workspaces/:id` as an ADMIN | 403 Forbidden |

#### 3. Injection Testing

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| SQL injection in message content | Send `'; DROP TABLE messages; --` as message content | Content stored as literal string; no DB error |
| SQL injection in search query | `GET /search?q='; DROP TABLE messages; --` | Safe query result; no DB error |
| XSS in message content | Send `<script>alert(1)</script>` | Stored as sanitized text or escaped on render |
| XSS in workspace name | `POST /workspaces` with `<img src=x onerror=alert(1)>` | Sanitized on store; no execution |
| Path traversal in file upload | Upload file with name `../../etc/passwd` | File stored with UUID name; original name rejected |

#### 4. WebSocket Security

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| Unauthenticated WS connection | Connect without `auth.token` | Connection refused with auth error |
| Join arbitrary channel room | Emit `join_channel` for a channel in a different workspace | Server ignores or emits error |
| WS message rate limiting | Send >30 messages in 10 seconds | Messages throttled; connection warned or disconnected |
| Malformed WS payload | Send events with missing/extra/malformed fields | Server handles gracefully; no crash |
| WS token expiry | Connect with valid token; wait for expiry; attempt actions | Session should be treated as expired on next auth check |

#### 5. Rate Limiting

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| Login rate limit | 11 POST /auth/login requests/min | 429 after 10, `Retry-After` header present |
| Register rate limit | 6 POST /auth/register requests/min | 429 after 5 |
| General API rate limit | 61 requests/min | 429 after 60 |
| Upload rate limit | 11 POST /upload requests/min | 429 after 10 |

#### 6. Sensitive Data Exposure

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| Password in API response | `POST /auth/login` or `GET /auth/profile` | `passwordHash` field absent from response |
| JWT in error responses | Trigger a 4xx/5xx error | No JWT or internal token in error body |
| Gemini API key exposure | Inspect all API responses and error messages | No API keys in any response |
| Stack traces in production | Trigger a 500 error | Generic error message, no stack trace |

#### 7. Infrastructure

| Test Case | Method | Expected Result |
|-----------|--------|----------------|
| `/metrics` public access | `GET https://api.collabstudy.com/metrics` from external IP | 403 or connection refused (nginx restriction) |
| DB port exposure | Port scan for 5432 from external IP | Port closed / not reachable |
| Redis port exposure | Port scan for 6379 from external IP | Port closed / not reachable |
| HTTP to HTTPS redirect | `http://api.collabstudy.com` | 301 redirect to HTTPS |
| HSTS header | `curl -I https://api.collabstudy.com` | `Strict-Transport-Security` header present |

### Reporting

All findings should be submitted as a structured report containing:

1. **Severity** (Critical / High / Medium / Low / Informational)
2. **CVSS Score** (where applicable)
3. **Description** — what the vulnerability is
4. **Reproduction steps** — exact request/response to reproduce
5. **Impact** — what an attacker could achieve
6. **Recommendation** — specific fix

**Responsible disclosure:** Contact `security@collabstudy.com` for any critical findings before public disclosure. Allow 30 days for remediation.

---

## Security Headers Verification

Verify the following headers are present on all API responses:

```bash
curl -I https://api.collabstudy.com/health
```

Expected headers:

| Header | Expected Value |
|--------|---------------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | Configured CSP (see Helmet config in `main.ts`) |
| `X-XSS-Protection` | `0` (deprecated — CSP is the modern replacement) |

---

## Ongoing Security Checklist

Run before every major release:

- [ ] `pnpm audit` — no NEW high/critical runtime dependency vulnerabilities
- [ ] All DTOs have `class-validator` decorators + global `ValidationPipe`
- [ ] No `console.log` statements in API or frontend production code
- [ ] No secrets or API keys in API responses or error messages
- [ ] All new endpoints verified for IDOR: workspace/channel membership checked
- [ ] Rate limiting applied to all new auth-adjacent endpoints
- [ ] Docker images rebuilt from scratch (no cached layers with stale deps)
- [ ] Sentry error tracking active and receiving events
- [ ] `/metrics` endpoint restricted to internal network
