# CollabStudy — Performance Benchmarks

> **Phase 12.6** | Load testing strategy, target metrics, bottleneck analysis, and results.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Running the Tests](#running-the-tests)
3. [Target Metrics](#target-metrics)
4. [Test Scripts Overview](#test-scripts-overview)
5. [Benchmark Results](#benchmark-results)
6. [Bottleneck Analysis](#bottleneck-analysis)
7. [Scaling Recommendations](#scaling-recommendations)

---

## Prerequisites

### Install k6

```bash
# macOS
brew install k6

# Ubuntu / Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows (Chocolatey)
choco install k6

# Docker
docker pull grafana/k6
```

### Create a load test user

Before running tests, create a dedicated test user and a test channel:

```bash
# Register the load test user
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"loadtest@example.com","password":"LoadTest123!","username":"loadtest"}'

# Note the access_token, then create a workspace + channel and note the channelId
```

---

## Running the Tests

```bash
# WebSocket connection scaling (1,000 concurrent connections)
pnpm test:load:ws -- \
  -e API_BASE_URL=http://localhost:4000 \
  -e TEST_USER_EMAIL=loadtest@example.com \
  -e TEST_USER_PASSWORD=LoadTest123! \
  -e TEST_CHANNEL_ID=<uuid>

# HTTP message throughput (100 messages/second)
pnpm test:load:messages -- \
  -e API_BASE_URL=http://localhost:4000 \
  -e TEST_USER_EMAIL=loadtest@example.com \
  -e TEST_USER_PASSWORD=LoadTest123! \
  -e TEST_CHANNEL_ID=<uuid>

# File upload concurrency (50 concurrent uploads)
pnpm test:load:uploads -- \
  -e API_BASE_URL=http://localhost:4000 \
  -e TEST_USER_EMAIL=loadtest@example.com \
  -e TEST_USER_PASSWORD=LoadTest123!

# Run all three sequentially
pnpm test:load:all
```

Results are saved to `load-tests/results/` as JSON files.

### Running in CI (GitHub Actions)

```yaml
- name: Install k6
  run: |
    sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
      --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
      | sudo tee /etc/apt/sources.list.d/k6.list
    sudo apt-get update && sudo apt-get install k6

- name: Run load tests
  run: pnpm test:load:all
  env:
    API_BASE_URL: ${{ vars.LOAD_TEST_API_URL }}
    TEST_USER_EMAIL: ${{ secrets.LOAD_TEST_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.LOAD_TEST_PASSWORD }}
    TEST_CHANNEL_ID: ${{ vars.LOAD_TEST_CHANNEL_ID }}
```

---

## Target Metrics

These are the production readiness targets defined in the ROADMAP:

| Test | Metric | Target | Pass Threshold |
|------|--------|--------|---------------|
| **WebSocket Connections** | Max concurrent connections | 1,000 | ≥ 990 connected |
| | Connection success rate | ≥ 99% | `ws_connect_success rate >= 0.99` |
| | p95 connection time | < 500ms | `ws_connect_time_ms p(95) < 500` |
| | WS error rate | < 1% | `ws_connect_errors rate < 0.01` |
| **HTTP Messages** | Throughput | 100 req/s | Actual rate ≥ 90 req/s |
| | p50 response time | < 100ms | `message_post_latency_ms p(50) < 100` |
| | p99 response time | < 500ms | `message_post_latency_ms p(99) < 500` |
| | Success rate | ≥ 95% | `message_post_success rate >= 0.95` |
| **File Uploads** | Concurrent uploads | 50 | ≥ 47 concurrent (95%) |
| | p95 upload time (5MB) | < 5s | `upload_latency_ms p(95) < 5000` |
| | p99 upload time | < 10s | `upload_latency_ms p(99) < 10000` |
| | 5xx error rate | 0% | `upload_server_errors count == 0` |

---

## Test Scripts Overview

### `load-tests/ws-connections.js` — WebSocket Connection Scaling

**Strategy:** Ramps from 0 → 1,000 concurrent Socket.io connections over 90 seconds, holds for 60 seconds, ramps down.

**What it tests:**
- Redis Socket.io adapter under concurrent pub/sub load
- JWT authentication overhead at connection time
- Memory usage per connection in the NestJS gateway
- Socket.io server capacity limits

**Ramp profile:**
```
0s  → 30s : 0    → 200  VUs (connections)
30s → 60s : 200  → 500  VUs
60s → 90s : 500  → 1000 VUs
90s → 150s: 1000 VUs (hold)
150s→ 165s: 1000 → 0    VUs (drain)
```

---

### `load-tests/http-messages.js` — HTTP Message Throughput

**Strategy:** Uses k6's `constant-arrival-rate` executor to drive exactly 100 POST requests per second to `/channels/:id/messages` for 90 seconds.

**What it tests:**
- NestJS request handling throughput
- Prisma ORM write throughput under load
- BullMQ embeddings queue backpressure (each message enqueues an embedding job)
- Database write bottlenecks (PostgreSQL connection pool)
- Rate limiting under legitimate high-traffic load

**Important:** Uses realistic message content from a SharedArray to avoid artificial caching. Each message also triggers an async embedding job — monitor `bullmq_queue_depth_total` during this test.

---

### `load-tests/file-uploads.js` — Concurrent File Upload Stress

**Strategy:** Ramps to 50 concurrent file-uploading VUs with random file sizes (1–10MB) and holds for 60 seconds.

**What it tests:**
- Multipart form data parsing throughput
- S3 upload parallelism (or local disk write backpressure)
- Memory usage during large file buffering
- Upload rate limiting (10 uploads/min per user — expect 429s at sustained 50 concurrent)

**Note on rate limiting:** The upload endpoint allows 10 uploads/minute per user. With 50 concurrent VUs all using the same test account, rate limiting will trigger. For a more realistic test, create 50 separate test user accounts and distribute VUs across them using `scenarios` with tagged users.

---

## Benchmark Results

> Fill in this table after running the tests against a production-equivalent environment.

### Environment

| Component | Spec |
|-----------|------|
| API | Docker container, 2 vCPU, 4GB RAM |
| PostgreSQL | Docker container, 2 vCPU, 4GB RAM, SSD |
| Redis | Docker container, 1 vCPU, 1GB RAM |
| Load generator | k6 running on separate machine/container |
| Network | Same Docker network (internal) |

### Results Table

| Test | Metric | Target | **Actual** | Status |
|------|--------|--------|------------|--------|
| WS | Max concurrent | 1,000 | _TBD_ | ⬜ |
| WS | Success rate | ≥ 99% | _TBD_ | ⬜ |
| WS | p95 connect time | < 500ms | _TBD_ | ⬜ |
| HTTP | Throughput | 100 req/s | _TBD_ | ⬜ |
| HTTP | p50 latency | < 100ms | _TBD_ | ⬜ |
| HTTP | p99 latency | < 500ms | _TBD_ | ⬜ |
| Upload | Concurrent | 50 | _TBD_ | ⬜ |
| Upload | p95 time (5MB) | < 5s | _TBD_ | ⬜ |
| Upload | 5xx errors | 0 | _TBD_ | ⬜ |

---

## Bottleneck Analysis

### 1. PostgreSQL Connection Pool Exhaustion

**Symptom:** `p99 latency spikes > 1s` during HTTP messages test. Error: `PrismaClientKnownRequestError: Can't reach database server`.

**Root cause:** Prisma's default connection pool is `min(num_cpus * 2 + 1, 10)`. Under 100 req/s with async operations, the pool exhausts.

**Resolution:**
```env
# apps/api/.env — increase connection pool
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=25&pool_timeout=30
```

Also add a connection limit to `schema.prisma` via the datasource URL parameter.

---

### 2. Redis Pub/Sub Throughput Limit

**Symptom:** WS connections drop above ~800, `ws_connect_errors` spikes.

**Root cause:** Single Redis instance becomes a bottleneck for Socket.io pub/sub at high connection counts.

**Resolution:**
- Upgrade Redis to a larger instance (minimum 2 vCPU, 2GB RAM for 1,000+ connections)
- Enable Redis persistence (`appendonly yes`) to prevent data loss during restarts
- For >5,000 connections: use Redis Cluster or migrate to a dedicated pub/sub service

---

### 3. BullMQ Queue Depth Spike

**Symptom:** `bullmq_queue_depth_total{queue="embeddings"}` exceeds 1,000 during messages test.

**Root cause:** Each message enqueues an embedding job. At 100 msg/s, the Gemini API (which processes at ~10–20 embeddings/s) cannot keep up.

**Resolution:**
- Scale BullMQ worker concurrency: add `concurrency: 5` to `EmbeddingsProcessor`
- Batch embedding calls: accumulate 10 messages then call `embedContent` in batch
- Alert threshold already configured in `OBSERVABILITY.md`: queue depth > 1,000 → Critical

---

### 4. Upload Memory Pressure

**Symptom:** API container memory exceeds 90% during 50-concurrent uploads of 10MB files.

**Root cause:** NestJS buffers the entire multipart file in memory before streaming to S3 (or disk).

**Resolution:**
- Enable streaming uploads: pipe `req` directly to S3 `PutObjectCommand` using Node.js streams
- Set `limits.fileSize` in Multer to reject files above configured maximum before buffering
- Current upload limit is enforced in `UploadService` — verify it rejects files > `MAX_FILE_SIZE`

---

### 5. Event Loop Lag Under Load

**Symptom:** `nodejs_eventloop_lag_p99_seconds > 0.1` (100ms) during messages test.

**Root cause:** CPU-intensive operations (bcrypt, JSON parsing of large payloads) blocking the event loop.

**Resolution:**
- Move CPU-intensive work off the main thread using `worker_threads` or `child_process`
- Reduce bcrypt `saltRounds` from 10 to 8 for lower-latency environments (accept slightly reduced security)
- Profile with `--prof` Node.js flag to identify hot functions

---

## Scaling Recommendations

### Single-node limits (1 API container)

Based on benchmark targets:

| Load | Recommendation |
|------|---------------|
| < 500 concurrent users | Current setup sufficient |
| 500–2,000 concurrent users | Increase DB pool, Redis RAM |
| 2,000–10,000 concurrent users | Horizontal API scaling (2–4 containers) + Redis Cluster |
| > 10,000 concurrent users | Kubernetes + auto-scaling + read replicas |

### Horizontal scaling checklist

Before scaling to multiple API containers:

- [x] Redis Socket.io adapter configured (Phase 9.1) — WS events broadcast via pub/sub
- [x] BullMQ uses Redis — jobs distributed across workers automatically
- [ ] Session/auth is stateless (JWT) — no sticky sessions required ✅
- [ ] Prisma connection pool tuned per instance (`connection_limit / num_instances`)
- [ ] Health check endpoint (`GET /health`) returns 200 so load balancer can route correctly
- [ ] Prometheus scrapes all instances (use service discovery or fixed targets)
