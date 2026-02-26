# CollabStudy — Observability & Metrics

> **Phase 12.4** | Prometheus metrics, alerting thresholds, and OpenTelemetry guidance.

---

## Table of Contents

1. [Prometheus Metrics Endpoint](#prometheus-metrics-endpoint)
2. [Available Metrics](#available-metrics)
3. [Alerting Thresholds](#alerting-thresholds)
4. [Grafana Dashboard Setup](#grafana-dashboard-setup)
5. [OpenTelemetry Distributed Tracing](#opentelemetry-distributed-tracing)
6. [Log Aggregation](#log-aggregation)

---

## Prometheus Metrics Endpoint

The API exposes a standard Prometheus text-format scrape endpoint:

```
GET /metrics
```

**Authentication:** None (intentional). Restrict this endpoint at the infrastructure layer:

```nginx
# nginx — allow only Prometheus scraper, deny all others
location /metrics {
  allow 10.0.0.0/8;    # internal network only
  deny  all;
}
```

Or via Docker network policy / firewall rule — never expose `/metrics` to the public internet.

### Prometheus scrape config (`prometheus.yml`)

```yaml
scrape_configs:
  - job_name: collabstudy-api
    scrape_interval: 30s
    scrape_timeout: 10s
    static_configs:
      - targets: ['api:4000']
    metrics_path: /metrics
```

---

## Available Metrics

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency in seconds. Buckets: 10ms–10s |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total request count |

**Useful PromQL queries:**

```promql
# p99 latency (last 5 minutes)
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# p50 latency per route
histogram_quantile(0.50,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# Error rate (5xx / total)
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))

# Request rate (req/s)
sum(rate(http_requests_total[1m]))
```

---

### WebSocket Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ws_connected_clients_total` | Gauge | — | Currently authenticated Socket.io connections |

**PromQL:**

```promql
# Current WebSocket client count
ws_connected_clients_total

# Alert if WS connections spike (possible connection storm)
ws_connected_clients_total > 5000
```

---

### BullMQ Queue Metrics

Polled every 30 seconds from the `SUMMARY_QUEUE` and `EMBEDDINGS_QUEUE`.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `bullmq_queue_depth_total` | Gauge | `queue` | Waiting (pending) jobs per queue |
| `bullmq_queue_active_total` | Gauge | `queue` | Actively-processing jobs |
| `bullmq_queue_failed_total` | Gauge | `queue` | Failed jobs (accumulated) |

**PromQL:**

```promql
# Queue depth per queue
bullmq_queue_depth_total

# Total queue depth across all queues
sum(bullmq_queue_depth_total)

# Failed jobs — rising trend indicates worker issues
increase(bullmq_queue_failed_total[1h])
```

---

### Node.js Default Metrics

Automatically collected via `prom-client`'s `collectDefaultMetrics()`:

| Metric prefix | Description |
|---------------|-------------|
| `nodejs_heap_size_*` | V8 heap used/total |
| `nodejs_gc_duration_seconds` | Garbage collection duration |
| `nodejs_eventloop_lag_*` | Event loop lag (mean, p50, p90, p99) |
| `nodejs_active_handles_total` | Open file descriptors / sockets |
| `process_cpu_seconds_total` | CPU time |
| `process_resident_memory_bytes` | RSS memory |

---

## Alerting Thresholds

Configure these rules in your Prometheus Alertmanager or Grafana alerting:

### 🔴 Critical Alerts

| Alert | Condition | Duration | Severity | Action |
|-------|-----------|----------|----------|--------|
| **High Error Rate** | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01` | 2 min | Critical | Page on-call engineer |
| **High p99 Latency** | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 0.5` | 5 min | Critical | Investigate slow queries / DB |
| **Queue Depth Exceeded** | `sum(bullmq_queue_depth_total) > 1000` | 5 min | Critical | Scale workers or investigate Gemini API |
| **API Down** | `up{job="collabstudy-api"} == 0` | 1 min | Critical | Immediate — container restart |

### 🟡 Warning Alerts

| Alert | Condition | Duration | Severity | Action |
|-------|-----------|----------|----------|--------|
| **Elevated Error Rate** | `> 0.5%` | 5 min | Warning | Monitor; check recent deploys |
| **p99 Latency Warning** | `> 250ms` | 10 min | Warning | Review slow query log |
| **High Queue Depth** | `> 500` | 10 min | Warning | Check worker health |
| **High Memory Usage** | `process_resident_memory_bytes > 1.5e9` (1.5 GB) | 10 min | Warning | Memory leak investigation |
| **Event Loop Lag** | `nodejs_eventloop_lag_p99_seconds > 0.1` (100ms) | 5 min | Warning | CPU-bound operation blocking event loop |
| **WS Client Spike** | `ws_connected_clients_total > 5000` | 2 min | Warning | Check for connection storm |

### Prometheus Alertmanager Rule File Example

```yaml
groups:
  - name: collabstudy.api
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.01
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API error rate exceeds 1%"
          description: "Current error rate: {{ $value | humanizePercentage }}"

      - alert: HighP99Latency
        expr: |
          histogram_quantile(0.99,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 0.5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "p99 latency exceeds 500ms"
          description: "Current p99: {{ $value | humanizeDuration }}"

      - alert: QueueDepthHigh
        expr: sum(bullmq_queue_depth_total) > 1000
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "BullMQ queue depth exceeds 1000 jobs"
          description: "Total pending jobs: {{ $value }}"
```

---

## Grafana Dashboard Setup

### Quick start with Docker Compose

Add Prometheus + Grafana to `docker-compose.prod.yml`:

```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.retention.time=15d'
  networks:
    - collabstudy-prod-network
  expose:
    - "9090"

grafana:
  image: grafana/grafana:latest
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-changeme}
  volumes:
    - grafana_data:/var/lib/grafana
  ports:
    - "3001:3000"
  networks:
    - collabstudy-prod-network
```

### Recommended Grafana panels

1. **Request Rate** — `sum(rate(http_requests_total[1m]))` (stat + time series)
2. **Error Rate %** — `(rate(5xx) / rate(total)) * 100` (gauge with threshold coloring)
3. **p50 / p95 / p99 Latency** — histogram quantile time series
4. **Active WS Connections** — `ws_connected_clients_total` (stat)
5. **Queue Depth** — `bullmq_queue_depth_total` grouped by `queue` (bar chart)
6. **Node.js Heap** — `nodejs_heap_size_used_bytes` (time series)
7. **Event Loop Lag p99** — `nodejs_eventloop_lag_p99_seconds * 1000` (stat in ms)

---

## OpenTelemetry Distributed Tracing

> **Status:** Optional — Sentry (Phase 12.5) provides transaction-level tracing. OTel adds cross-service distributed tracing when multiple services communicate.

### Setup (future step)

1. **Install SDK:**
   ```bash
   pnpm add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
     @opentelemetry/exporter-trace-otlp-http
   ```

2. **Create `tracing.ts`** (import before all others in `main.ts`):
   ```typescript
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
   import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

   const sdk = new NodeSDK({
     traceExporter: new OTLPTraceExporter({
       url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
     }),
     instrumentations: [getNodeAutoInstrumentations()],
   });
   sdk.start();
   ```

3. **Run a collector** (Jaeger, Tempo, or OTLP-compatible):
   ```yaml
   # docker-compose.prod.yml addition
   jaeger:
     image: jaegertracing/all-in-one:latest
     ports:
       - "16686:16686"  # UI
       - "4318:4318"    # OTLP HTTP
   ```

4. **View traces** at `http://localhost:16686`

### What OTel adds beyond Sentry

| Capability | Sentry | OpenTelemetry |
|-----------|--------|---------------|
| Error tracking | ✅ | ❌ |
| Transaction traces | ✅ | ✅ |
| Cross-service trace propagation | Partial | ✅ |
| DB query spans | Partial | ✅ (auto-instrument) |
| BullMQ job traces | ❌ | ✅ (custom spans) |
| Vendor-neutral | ❌ | ✅ |

---

## Log Aggregation

The API emits structured JSON logs via Pino (Phase 8.3). Ingest them into any log aggregator:

### Loki + Grafana (recommended for self-hosted)

```yaml
# docker-compose.prod.yml addition
loki:
  image: grafana/loki:latest
  ports:
    - "3100:3100"
  networks:
    - collabstudy-prod-network

promtail:
  image: grafana/promtail:latest
  volumes:
    - /var/log:/var/log:ro
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
  networks:
    - collabstudy-prod-network
```

### Datadog / New Relic

Set the Pino transport to emit to stdout and configure the agent to collect Docker container logs automatically. No code changes needed — the JSON format is already compatible.

---

> 💡 **Alert fatigue tip:** Start with only the 4 Critical alerts. Tune thresholds against real production traffic for 2 weeks before enabling Warning-level alerts.
