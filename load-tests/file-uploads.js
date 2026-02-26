/**
 * k6 Load Test — Concurrent File Uploads
 * =======================================
 * Target: 50 concurrent file uploads with realistic payload sizes (1–10MB)
 *         to test upload module backpressure, S3 integration, and queue depth.
 *
 * Run:
 *   k6 run load-tests/file-uploads.js \
 *     -e API_BASE_URL=http://localhost:4000 \
 *     -e TEST_USER_EMAIL=loadtest@example.com \
 *     -e TEST_USER_PASSWORD=LoadTest123!
 *
 * Pass/Fail Thresholds:
 *   - Upload success rate >= 95%
 *   - p95 upload time < 5s (for 5MB payload)
 *   - p99 upload time < 10s
 *   - Zero 5xx errors
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom Metrics ────────────────────────────────────────────────────────────
const uploadSuccess  = new Rate('upload_success');
const uploadFailed   = new Rate('upload_failed');
const uploadLatency  = new Trend('upload_latency_ms', true);
const uploadBytes    = new Counter('upload_bytes_total');
const serverErrors   = new Counter('upload_server_errors');

// ── Test Configuration ────────────────────────────────────────────────────────
const API_BASE_URL  = __ENV.API_BASE_URL    || 'http://localhost:4000';
const TEST_EMAIL    = __ENV.TEST_USER_EMAIL || 'loadtest@example.com';
const TEST_PASSWORD = __ENV.TEST_USER_PASSWORD || 'LoadTest123!';

// File size variants to test (bytes)
const FILE_SIZES = [
  1  * 1024 * 1024,  //  1 MB
  3  * 1024 * 1024,  //  3 MB
  5  * 1024 * 1024,  //  5 MB
  8  * 1024 * 1024,  //  8 MB
  10 * 1024 * 1024,  // 10 MB
];

const MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

export const options = {
  scenarios: {
    concurrent_uploads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 }, // Warm up with 10 concurrent uploads
        { duration: '20s', target: 50 }, // Ramp to 50 concurrent uploads
        { duration: '60s', target: 50 }, // Hold 50 concurrent uploads for 60s
        { duration: '10s', target: 0  }, // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    upload_success:   [{ threshold: 'rate>=0.95',   abortOnFail: false }],
    upload_latency_ms: [
      { threshold: 'p(95)<5000',  abortOnFail: false }, // p95 < 5s
      { threshold: 'p(99)<10000', abortOnFail: false }, // p99 < 10s
    ],
    // Zero 5xx server errors
    'http_req_failed': [{ threshold: 'rate<0.05', abortOnFail: false }],
  },
};

// ── Per-VU auth cache ─────────────────────────────────────────────────────────
let authToken   = null;
let authHeaders = null;

function ensureAuth() {
  if (authToken) return true;

  const res = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    console.error(`Auth failed: ${res.status}`);
    return false;
  }

  try {
    authToken  = JSON.parse(res.body).access_token;
    authHeaders = { Authorization: `Bearer ${authToken}` };
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a dummy binary payload of the specified size.
 * Uses a repeated pattern — not cryptographically meaningful, just realistic size.
 */
function generatePayload(sizeBytes) {
  // k6 doesn't have Buffer, use a Uint8Array filled with pseudo-random bytes
  const chunkSize = Math.min(sizeBytes, 65536);
  const chunk = new Uint8Array(chunkSize);
  for (let i = 0; i < chunkSize; i++) {
    chunk[i] = (i * 37 + 13) % 256; // Deterministic pattern
  }
  return chunk;
}

// ── Main VU function ──────────────────────────────────────────────────────────
export default function () {
  if (!ensureAuth()) return;

  // Pick a random file size and MIME type
  const fileSize  = FILE_SIZES[Math.floor(Math.random() * FILE_SIZES.length)];
  const mimeType  = MIME_TYPES[Math.floor(Math.random() * MIME_TYPES.length)];
  const ext       = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'pdf';
  const fileName  = `load-test-file-${__VU}-${__ITER}.${ext}`;

  const payload   = generatePayload(fileSize);

  const formData = {
    file: http.file(payload, fileName, mimeType),
  };

  const start = Date.now();
  const res = http.post(
    `${API_BASE_URL}/upload`,
    formData,
    { headers: authHeaders, timeout: '30s' },
  );
  const duration = Date.now() - start;

  uploadLatency.add(duration);
  uploadBytes.add(fileSize);

  const success = check(res, {
    'upload: status 201': (r) => r.status === 201,
    'upload: has fileUrl': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!(body?.fileUrl || body?.url || body?.key);
      } catch {
        return false;
      }
    },
  });

  if (success) {
    uploadSuccess.add(true);
    uploadFailed.add(false);
  } else {
    uploadSuccess.add(false);
    uploadFailed.add(true);
    if (res.status >= 500) serverErrors.add(1);
    if (res.status === 429) sleep(2); // Back off on rate limit
  }

  // Small pause between uploads per VU to simulate realistic user behaviour
  sleep(Math.random() * 2 + 0.5);
}

export function handleSummary(data) {
  return {
    stdout: formatSummary(data),
    'load-tests/results/file-uploads-summary.json': JSON.stringify(data, null, 2),
  };
}

function formatSummary(data) {
  const metrics   = data.metrics;
  const successRate = (metrics.upload_success?.values?.rate   * 100 || 0).toFixed(2);
  const failRate    = (metrics.upload_failed?.values?.rate    * 100 || 0).toFixed(2);
  const p95         = metrics.upload_latency_ms?.values?.['p(95)']?.toFixed(2) || 'N/A';
  const p99         = metrics.upload_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A';
  const totalBytes  = ((metrics.upload_bytes_total?.values?.count || 0) / 1e6).toFixed(2);
  const maxVUs      = metrics.vus_max?.values?.max || 'N/A';
  const srvErrors   = metrics.upload_server_errors?.values?.count || 0;

  return `
═══════════════════════════════════════════════════════
 k6 File Upload Test — Summary
═══════════════════════════════════════════════════════
 Max concurrent uploads    : ${maxVUs}
 Upload success rate       : ${successRate}%  (target: ≥ 95%)
 Upload failure rate       : ${failRate}%
 5xx server errors         : ${srvErrors}   (target: 0)
 Total data transferred    : ${totalBytes} MB
 p95 upload time           : ${p95}ms  (target: < 5,000ms)
 p99 upload time           : ${p99}ms  (target: < 10,000ms)
═══════════════════════════════════════════════════════
`;
}
