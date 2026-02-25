# CollabStudy — Master Engineering Roadmap
## Diamond-Level Production SaaS Platform

**Last Audited:** 2026-02-24  
**Stack:** Next.js 14 (App Router) · NestJS · PostgreSQL + Prisma · Socket.io · Redis · S3-compatible Storage

---

## GROUND RULES (Non-Negotiable)

1. Work in strictly sequential phases. Never skip or combine phases.
2. After EVERY step: TypeScript must compile clean, build must pass, existing tests must pass.
3. Provide a short verification report before moving to the next step.
4. No hacks, silent fallbacks, or temporary patches.
5. Strict TypeScript mode maintained at all times.
6. Modular architecture only — clear separation of DB / Service / Gateway / Controller / UI layers.
7. Never modify more than one vertical slice at a time.
8. Perfection over speed. We are building a real product, not a demo.

---

## MASTER STATUS TABLE

| Phase | Theme | Status |
| :--- | :--- | :--- |
| **Phase 0** | Foundation — Auth, DB Schema, REST, WebSocket | ✅ Complete |
| **Phase 1** | Real-Time Core — Presence, Typing, Socket Cleanup | ✅ Complete |
| **Phase 2** | Workspaces & Channels — CRUD, Roles, Membership | ✅ Complete |
| **Phase 3** | Security & Integration Tests | ✅ Complete |
| **Phase 4** | Collaboration — Reactions, Threads, Mentions, Read Receipts | ✅ Complete |
| **Phase 5** | Messaging Expansion — DMs, File Uploads, Search, AI Summaries | ✅ Complete |
| **Phase 6** | WebRTC — 1:1 Video Calls, Multi-User Voice Rooms | ✅ Complete |
| **Phase 7** | Storage Abstraction — S3/Local Adapter, Pre-signed URLs | ✅ Complete |
| **Phase 8** | Infrastructure Hardening — Security, Logging, Health, RBAC | ⏳ Next |
| **Phase 9** | Performance & Scalability — Redis Adapter, BullMQ, Rate Limiting | ⬜ Pending |
| **Phase 10** | Premium UI/UX Transformation — Diamond-Level Frontend | ⬜ Pending |
| **Phase 11** | Advanced AI — Semantic Search, Vector Embeddings, Smart Features | ⬜ Pending |
| **Phase 12** | Production Readiness — DevOps, Monitoring, CI/CD, Launch | ⬜ Pending |

---

## ✅ PHASE 0 — Foundation
**Status: COMPLETE**

- JWT Authentication (register, login, refresh)
- PostgreSQL schema with Prisma (User, Workspace, Channel, Message)
- Basic REST API (workspaces, channels, messages)
- Socket.io WebSocket gateway (chat.gateway.ts)
- NestJS modular architecture established

---

## ✅ PHASE 1 — Real-Time Core
**Status: COMPLETE**

- User presence (ONLINE / OFFLINE / AWAY / DO_NOT_DISTURB)
- Typing indicators (per channel)
- Socket connect / disconnect cleanup
- Personal user rooms (`user_<id>`) for targeted notifications

---

## ✅ PHASE 2 — Workspaces & Channels
**Status: COMPLETE**

- Workspace creation, rename, delete (owner only)
- Channel creation, rename, delete (owner/admin only)
- Workspace membership with roles (OWNER / ADMIN / MEMBER)
- ChannelMember table with `lastReadAt`
- Workspace discovery modal
- Real-time WS events: `new_channel_created`, `channel_updated`, `channel_deleted`, `workspace_updated`, `workspace_deleted`, `user_joined_workspace`

---

## ✅ PHASE 3 — Security & Integration Tests
**Status: COMPLETE**

- Integration test suites: workspaces, channels, messages, reactions, search, rate limiting (e2e specs in `apps/api/test/`)
- Workspace isolation: User A cannot access User B's workspace data
- Role enforcement on all protected endpoints

---

## ✅ PHASE 4 — Collaboration Features
**Status: COMPLETE**

- Emoji reactions (add / remove, unique per user per emoji per message)
- Threaded replies (parentId self-relation on Message)
- @Mentions (implicit many-to-many, `MentionInput` autocomplete)
- Mention toast notifications via WS (`user_mentioned`)
- Read receipts / Unread divider (`ChannelMember.lastReadAt`)
- Unread badge count per channel in sidebar
- Message edit (`isEdited` flag, WS broadcast)
- Message hard delete (WS broadcast)
- `ReadReceipt` table + `channel_read_cleared` WS event
- Cursor-based pagination (oldest-first initial load, scroll-up for history)
- Telegram-style message grouping UI
- Floating scroll-to-bottom FAB

---

## ✅ PHASE 5 — Messaging Expansion
**Status: COMPLETE**

- **Direct Messaging:** `DirectConversation`, `DirectParticipant`, `DirectMessage` schema
- DM REST API: `POST /direct/start`, `GET /direct`, `GET /direct/:id/messages`, `POST /direct/:id/messages`
- DM WebSocket room: `direct_<conversationId>`, events: `new_direct_message`, `dm_unread_notification`, `dm_read_cleared`
- DM unread badge in sidebar
- `DirectMessageArea.tsx` UI component
- **File Uploads:** Universal file support (image, video, audio, PDF, any type), 50MB limit
- File metadata stored: `fileUrl`, `fileType`, `fileSize`, `originalName`
- Smart frontend rendering: image inline preview, `<video>`, `<audio>`, generic file card
- **Full-Text Search:** `GET /search?q=&workspaceId=` using `pg_trgm` `word_similarity()` with GIN index
- Ranked results, cursor-based pagination, workspace-scoped, SQL injection safe
- **AI Smart Summaries:** Gemini 2.5 Flash via `AiService`/`AiModule`
- Channel summary: `GET /channels/:id/summary`
- DM summary: `GET /direct/:id/summary`
- `SummaryModal.tsx` UI component

---

## ✅ PHASE 6 — WebRTC Calls
**Status: COMPLETE**

- 1:1 video calls: offer/answer/ICE signaling via `chat.gateway.ts`
- `CallModal.tsx` — full incoming/outgoing call UI with ringtone
- Multi-user mesh voice rooms: `VoiceChannelBar.tsx` (Discord-style)
- WS events: `call_offer`, `call_answer`, `call_ice_candidate`, `call_ended`
- Ringtone audio management with loop/stop lifecycle

---

## ✅ PHASE 7 — Storage Abstraction
**Status: COMPLETE**

- `UploadService` with S3-compatible adapter (AWS S3, Supabase Storage, Cloudflare R2, MinIO)
- Placeholder credential detection → automatic local disk fallback (no crash)
- `diskStorage` (local dev) / `memoryStorage` (S3 mode) via `MulterModule`
- Pre-signed GET URL generation (`getSignedUrl`) for private S3 buckets
- `isS3Enabled()` public method for controller-level branching
- `UploadModule` exported and imported into `MessagesModule` + `DirectModule`
- `apps/api/uploads/` directory guaranteed to exist
- Unit tests: 3 scenarios (placeholder creds, missing creds, valid creds) — all passing

---

## ⏳ PHASE 8 — Infrastructure Hardening
**Status: NEXT — Do not skip. Complete all steps before Phase 9.**

### Step 8.1 — Security Headers (Helmet + CSP)

**Backend:**
- Install and configure `@nestjs/helmet` in `main.ts`
- Set Content-Security-Policy (CSP) headers
- Set `X-Frame-Options: DENY`
- Set `X-Content-Type-Options: nosniff`
- Set `Referrer-Policy: strict-origin-when-cross-origin`
- Set `Permissions-Policy` header

**Verification:**
- `curl -I http://localhost:4000` shows all security headers present
- No regression on existing API endpoints
- TypeScript compiles clean

---

### Step 8.2 — Input Sanitization

**Backend:**
- Install `class-sanitizer` or use `class-transformer` + manual strip
- Strip HTML/script tags from all user-supplied string fields (message content, workspace name, channel name, username)
- Add global `ValidationPipe` with `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` (verify it's already applied — if not, apply globally in `main.ts`)

**Verification:**
- Sending `<script>alert(1)</script>` as message content is stored as plain text or rejected
- No regression on existing DTOs

---

### Step 8.3 — Structured Logging (Pino)

**Backend:**
- Install `nestjs-pino` + `pino-http`
- Replace default NestJS Logger with Pino in `main.ts`
- Add `X-Request-ID` middleware (UUID per request, passed to Pino context)
- Log format: JSON in production, pretty-print in development
- Log levels: `error`, `warn`, `log` (info), `debug` (dev only)
- Ensure all existing `Logger` calls in services/gateway work unchanged

**Verification:**
- `NODE_ENV=production` outputs JSON logs
- Each log line contains `requestId`, `method`, `path`, `statusCode`, `responseTime`
- TypeScript compiles clean

---

### Step 8.4 — Health Endpoint

**Backend:**
- Install `@nestjs/terminus`
- Create `GET /health` endpoint returning:
  ```json
  {
    "status": "ok",
    "info": {
      "database": { "status": "up" },
      "redis": { "status": "up" },
      "storage": { "status": "up", "mode": "local|s3" }
    }
  }
  ```
- DB health check via Prisma `$queryRaw\`SELECT 1\``
- Redis health check via `ioredis` ping (reuse existing Redis from throttler)
- Storage health check: if S3, attempt a lightweight `HeadBucketCommand`; if local, verify `uploads/` directory is writable

**Verification:**
- `GET /health` returns `200 { status: "ok" }` when all services are up
- Returns `503` when DB is unreachable
- No auth required on this endpoint (whitelist in `JwtAuthGuard`)

---

### Step 8.5 — Role-Based Access Control (RBAC) Hardening

**Backend:**
- Audit all existing endpoints against role requirements:
  - `OWNER`: delete workspace, transfer ownership
  - `ADMIN`: create/rename/delete channels
  - `MEMBER`: read channels, send messages
- Create a `@Roles()` decorator + `RolesGuard` if not already in place
- Apply to all workspace/channel mutation endpoints
- Verify that MEMBER cannot call ADMIN/OWNER endpoints (return 403)

**Verification:**
- Integration tests cover 403 cases for all restricted endpoints
- Existing test suite still passes
- TypeScript compiles clean

---

## ⬜ PHASE 9 — Performance & Scalability
**Status: Pending Phase 8 completion.**

### Step 9.1 — Redis Socket.io Adapter

**Backend:**
- Install `@socket.io/redis-adapter` + `ioredis`
- Configure in `chat.module.ts` or `main.ts` to use Redis pub/sub for Socket.io
- Use the same Redis instance as the throttler
- Graceful fallback: if Redis is unavailable, fall back to in-memory adapter with a `WARN` log

**Verification:**
- Multiple NestJS instances can broadcast to the same Socket.io room
- Existing WS events still work (new_message, typing, presence)
- TypeScript compiles clean

---

### Step 9.2 — Rate Limiting Hardening

**Backend (verify + extend existing RedisThrottlerStorage):**
- Per-user limit: 60 requests/minute on general API
- Per-IP limit: 200 requests/minute (unauthenticated endpoints)
- Upload endpoint: 10 uploads/minute per user
- WebSocket message rate: 30 messages/10 seconds per socket connection (enforce in `chat.gateway.ts`)
- Return proper `Retry-After` header on 429 responses

**Verification:**
- `rate-limit.e2e-spec.ts` covers all 4 limit types
- 429 response includes `Retry-After` header
- No regression on normal usage

---

### Step 9.3 — BullMQ Background Jobs

**Backend:**
- Install `@nestjs/bullmq` + `bullmq` + `ioredis`
- Create `JobsModule` with a Redis-backed queue
- Move AI summary generation off the request thread:
  - `POST /channels/:id/summarize` enqueues a job → returns `{ jobId }` immediately
  - Worker processes job → stores result in Redis cache with 1-hour TTL
  - `GET /channels/:id/summary` returns cached result or `{ status: "pending" }` if job not done yet
  - Cache is invalidated on `new_message` event for that channel
- Same pattern for DM summaries
- Queue dashboard (Bull Board) mounted at `/admin/queues` (protected by JWT + OWNER role)

**Verification:**
- Job enqueues on POST
- Worker executes and stores in Redis
- GET returns cached result within 1s on second call
- Cache invalidates on new message
- TypeScript compiles clean

---

### Step 9.4 — Query Performance Audit

**Backend:**
- Add `prisma.$on('query', ...)` logging in development to identify N+1 queries
- Add missing DB indexes if any found:
  - `Message.parentId` (already present — verify)
  - `DirectMessage.conversationId + createdAt` (already present — verify)
  - `ChannelMember.channelId` (already present — verify)
- Add GIN index on `messages.content` for pg_trgm (verify exists from search migration)
- Run `EXPLAIN ANALYZE` on the top 5 most-called queries and document results

**Verification:**
- No query takes more than 50ms on a dataset of 10,000 messages
- No N+1 patterns in critical paths (getConversations, findAllByChannel)

---

## ⬜ PHASE 10 — Premium UI/UX Transformation
**Status: Pending Phase 9 completion.**

> **Design Reference:** Telegram Web, Linear.app, Notion, Superhuman, Raycast  
> **Design Language:** Minimal · Clean · Futuristic · Premium · Elegant · Fast

### Step 10.1 — Design System & Tokens

**Frontend:**
- Define CSS design tokens in `globals.css`:
  - Color palette (primary, surface, muted, accent, danger, success)
  - Typography scale (font-family, sizes, weights, line-heights)
  - Spacing scale (4px base grid)
  - Border radius tokens
  - Shadow levels (sm, md, lg, xl)
  - Animation curves and durations
- Dark mode as default; Light mode toggle support
- Install `framer-motion` for animations
- Install `tailwind-merge` + `clsx` for conditional class utilities

**Verification:**
- Design tokens applied globally
- No visual regression on existing pages

---

### Step 10.2 — Premium Landing Page

**Frontend (`apps/web/src/app/page.tsx`):**
- Hero section: animated gradient background, glassmorphism card with product preview
- Feature highlights section (3–4 cards): Real-time chat, AI summaries, Video calls, File sharing
- Pricing teaser: Free / Pro / Diamond tiers (static display, no payment integration)
- CTA buttons: Login + Sign Up (float into view on scroll)
- Footer: minimal, clean
- Fully responsive (mobile-first)
- Smooth micro-animations via Framer Motion (fade-in, slide-up, stagger)
- No placeholder text — real, compelling copy

**Verification:**
- Lighthouse score ≥ 90 on mobile and desktop (performance, accessibility, best practices)
- No hydration errors
- TypeScript compiles clean

---

### Step 10.3 — App Layout Overhaul

**Frontend:**
- Redesign `Sidebar.tsx` — Telegram/Linear style:
  - Collapsible: full width (240px) ↔ icon-only (60px) with smooth CSS width transition
  - Tooltips on hover in collapsed mode
  - Logo at top, avatar + status at bottom
  - Navigation sections: Workspaces, Channels, Direct Messages, Settings
  - Unread badges refined: pill shape, animated pop-in
  - Workspace switcher as icon stack (left rail) + expandable panel
- Redesign top bar: workspace name + channel name breadcrumb, search icon, logout
- Redesign main content area: clean background, proper padding, max-width constraint
- Remove all `window.prompt()` and `window.confirm()` calls — replace with proper modal dialogs
- Add proper empty states with illustrations for: no workspace, no channels, no messages

**Verification:**
- Sidebar collapse/expand is smooth (no layout jump)
- All existing functionality (channel select, DM select, workspace CRUD) still works
- No TypeScript errors
- Mobile layout: sidebar becomes a slide-over drawer on small screens

---

### ✅ Step 10.4 — Chat UI Polish — COMPLETE

**Frontend:**
- ✅ Telegram-style message bubbles — modular sub-components (MessageBubble, MessageActions, ReactionPill, TypingIndicator, UnreadDivider, ScrollToBottomFAB)
- ✅ Sender name shown only on first message in a group; avatar only on last
- ✅ Message hover actions toolbar: Reply | React | Edit | Delete | Thread
- ✅ Reaction pill display: grouped by emoji with count, click to toggle
- ✅ File attachments: full inline preview for images, video/audio, generic file card with download
- ✅ Thread reply count badge under parent messages
- ✅ "Unread messages" divider: pill-style, centered, red gradient
- ✅ Typing indicator: animated bouncing dots, shows up to 3 usernames
- ✅ Scroll-to-bottom FAB: refined design with unread count badge
- ✅ Applied to both ChatArea and DirectMessageArea

**Verification:**
- ✅ Zero TypeScript errors
- ✅ All interactive states work (hover, focus, disabled)

---

### ✅ Step 10.5 — Full Media Viewer Modal — COMPLETE

**Frontend:**
- ✅ ImageLightbox: zoom (scroll/keys), pan when zoomed, ← → gallery navigation, Escape to close
- ✅ VideoPlayerModal: full-screen capable, native HTML5 controls, download button
- ✅ AudioPlayerModal: seek bar, volume, play/pause, ±5s skip, waveform bars, download button
- ✅ PDFPreviewModal: iframe embed, open-in-new-tab, download button
- ✅ MediaViewer orchestrator: dispatches by MIME type, GenericFileViewer fallback
- ✅ Wired into MessageBubble FileAttachment — all file types open correct viewer on click
- ✅ AI Summary bug fixes: Redis NOAUTH fixed, room key mismatch fixed, timeout alignment

**Verification:**
- ✅ All file types handled
- ✅ Keyboard accessible (Tab, Escape, arrow keys)
- ✅ Zero TypeScript errors

---

### Step 10.6 — Settings Page ✅ COMPLETE

**Frontend (`apps/web/src/app/settings/page.tsx`):**
- [x] Profile: change avatar (upload), change `fullName`, change `username`
- [x] Account: change email (read-only), change password
- [x] Appearance: Dark / Light / System theme toggle (persisted to `localStorage`)
- [x] Sidebar footer avatar → clicks to open `/settings`

**Backend:**
- [x] `GET /users/me` endpoint
- [x] `PATCH /users/me` endpoint for profile updates (fullName, username, avatarUrl)
- [x] `PATCH /users/me/password` endpoint (bcrypt verify + hash)
- [x] `UsersModule` registered in `AppModule`

**Verification:**
- [x] All settings persist after page refresh
- [x] Avatar upload uses existing `UploadService`
- [x] TypeScript compiles clean (both frontend and backend)

---

### Step 10.7 — Search UI

**Frontend:**
- Global search bar in top bar (Cmd+K shortcut to focus)
- Search results panel: slides in from right or opens as modal
- Results grouped by channel, sorted by relevance
- Each result shows: channel name, message excerpt with highlighted match, sender avatar + name, timestamp
- Click result → navigate to that channel and scroll to that message (highlight it briefly)

**Verification:**
- Search works for partial matches
- Results are clickable and navigate correctly
- Keyboard navigable (↑ ↓ Enter Escape)

---

## ⬜ PHASE 11 — Advanced AI Features
**Status: Pending Phase 10 completion.**

### Step 11.1 — Vector Embeddings Setup

**Database:**
- Enable `pgvector` extension via migration
- Add `embedding vector(1536)` nullable column to `messages` table
- Add `ivfflat` index on the embedding column

**Backend:**
- `EmbeddingService` that calls Google Gemini embedding API (or OpenAI `text-embedding-3-small`)
- Embeddings generated asynchronously via BullMQ job queue on new message creation
- Stored back to the `messages.embedding` column

**Verification:**
- Migration runs clean
- New messages get embeddings within 5 seconds of posting (via job queue)
- TypeScript compiles clean

---

### Step 11.2 — Hybrid Semantic Search

**Backend:**
- `GET /search/hybrid?q=&workspaceId=` endpoint
- Hybrid score: `0.6 × trigram_similarity + 0.4 × cosine_similarity`
- Cosine similarity via `<=>` operator (pgvector)
- Falls back to trigram-only if no embeddings exist for the message

**Frontend:**
- Add toggle in search UI: "Keyword Search" vs "Semantic Search"

**Verification:**
- Semantic search returns contextually similar messages even without exact keyword match
- Hybrid mode outperforms pure trigram on test queries
- Performance: search returns in < 200ms on 100k message dataset

---

### Step 11.3 — Smart Notification Summaries

**Backend:**
- `GET /users/me/digest` endpoint
- Returns AI-generated digest of: unread mentions, unread channel activity, DM summaries
- Cached in Redis per user, invalidated on new mention/message
- Summarizes using Gemini: "You were mentioned 3 times in #general. Key topic: project deadline."

**Frontend:**
- Notification panel in sidebar showing the digest
- "Mark all as read" button
- Individual notification items linking to the relevant message

**Verification:**
- Digest generates correctly for users with ≥ 1 unread item
- Cache invalidates on new mention
- TypeScript compiles clean

---

## ⬜ PHASE 12 — Production Readiness
**Status: Pending Phase 11 completion.**

### Step 12.1 — Environment Configuration Audit

- Document all required environment variables with descriptions and examples in `.env.example`
- Validate all required env vars on startup — throw clear error if any are missing (use `joi` or manual check in `main.ts`)
- Separate configs for `development`, `staging`, `production`

---

### Step 12.2 — Docker & Docker Compose

- `Dockerfile` for `apps/api` (multi-stage build: build → production)
- `Dockerfile` for `apps/web` (Next.js standalone output)
- `docker-compose.yml` (already exists — verify and refine):
  - `postgres` service with `init.sql`
  - `redis` service
  - `api` service
  - `web` service
  - Named volumes for postgres data + uploads
  - Health checks on all services
- `docker-compose.prod.yml` overrides for production

**Verification:**
- `docker compose up` starts the full stack cleanly
- `docker compose up --scale api=2` works correctly (with Redis socket adapter from Phase 9)

---

### Step 12.3 — CI/CD Pipeline

- GitHub Actions workflow:
  - On PR: lint → typecheck → unit tests → e2e tests
  - On merge to `main`: build Docker images → push to registry → deploy to staging
- Test coverage report as PR comment
- Fail fast on any TypeScript error

---

### Step 12.4 — Observability

- **Metrics:** Expose `GET /metrics` in Prometheus format (using `prom-client`)
  - HTTP request count + duration histograms
  - WebSocket connection count gauge
  - Queue depth gauge (BullMQ)
  - Active DB connection count
- **Alerting:** Document alert thresholds (error rate > 1%, p99 latency > 500ms, queue depth > 1000)
- **Distributed Tracing:** Add OpenTelemetry instrumentation (optional, document setup)

---

### Step 12.5 — Final Security Audit

- Run `npm audit` — resolve all high/critical vulnerabilities
- OWASP Top 10 checklist:
  - [x] Injection: parameterized queries throughout (Prisma + tagged template SQL)
  - [ ] Broken auth: verify JWT expiry, rotation, and invalidation strategy
  - [ ] XSS: verify CSP headers + input sanitization (Phase 8)
  - [ ] IDOR: verify all resources are scoped to the requesting user's workspace
  - [ ] Rate limiting: verify all limits in place (Phase 9)
  - [ ] Sensitive data: verify no secrets logged, no credentials in responses
- Penetration test plan documented

---

### Step 12.6 — Load Testing & Performance Benchmarks

- Use `k6` or `artillery` to run load tests:
  - 1,000 concurrent WebSocket connections
  - 100 messages/second sustained for 60 seconds
  - File upload: 50 concurrent uploads of 10MB files
- Document results and any bottlenecks found
- Fix any bottleneck before declaring production-ready

---

## DELIVERY CHECKLIST (Before Each Phase Sign-Off)

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `pnpm build` → succeeds
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] No `console.log` left in production code (use Logger)
- [ ] No hardcoded credentials or secrets
- [ ] API documented (at minimum: new routes listed with method, path, auth, body, response)
- [ ] WS events documented (event name, payload shape, direction)
- [ ] Verification report written before moving to next step

---

## QUICK REFERENCE — What Is Built & Where

| Feature | Backend | Frontend | Real-Time |
|---|---|---|---|
| Auth | `auth/` | `LoginForm`, `RegisterForm`, `AuthContext` | — |
| Workspaces | `workspaces/` | `Sidebar`, `DiscoverWorkspacesModal` | `workspace_updated`, `workspace_deleted`, `user_joined_workspace` |
| Channels | `channels/` | `Sidebar`, `CreateChannelModal` | `new_channel_created`, `channel_updated`, `channel_deleted` |
| Messages | `messages/` | `ChatArea`, `MentionInput` | `new_message`, `message_updated`, `message_deleted` |
| Threads | `messages/` (parentId) | `ThreadPanel` | `new_message` (scoped) |
| Reactions | `messages/` | `ChatArea` | `reaction_added`, `reaction_removed` |
| Mentions | `messages/` | `MentionInput`, `MentionToast` | `user_mentioned` |
| Read Receipts | `channels/` | `ChatArea` (unread divider) | `channel_read_cleared` |
| Direct Messages | `direct/` | `DirectMessageArea`, `Sidebar` | `new_direct_message`, `dm_unread_notification`, `dm_read_cleared` |
| File Uploads | `upload/` | `ChatArea`, `DirectMessageArea` | Included in message broadcast |
| Search | `search/` | `ChatArea` (search bar) | — |
| AI Summaries | `ai/`, `messages/`, `direct/` | `SummaryModal` | — |
| WebRTC Calls | `chat.gateway.ts` | `CallModal`, `VoiceChannelBar` | `call_offer`, `call_answer`, `call_ice_candidate`, `call_ended` |
| Storage | `upload/` (S3 + local) | — | — |
| Rate Limiting | `throttler/` (Redis-backed) | — | — |
