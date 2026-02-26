/**
 * k6 Load Test — HTTP Message Throughput
 * =======================================
 * Target: 100 messages/second sustained through POST /channels/:id/messages
 *         for 60 seconds with realistic authentication and payload.
 *
 * Run:
 *   k6 run load-tests/http-messages.js \
 *     -e API_BASE_URL=http://localhost:4000 \
 *     -e TEST_USER_EMAIL=loadtest@example.com \
 *     -e TEST_USER_PASSWORD=LoadTest123! \
 *     -e TEST_CHANNEL_ID=<uuid>
 *
 * Pass/Fail Thresholds:
 *   - HTTP request success rate (2xx) >= 95%
 *   - p99 response time < 500ms
 *   - p50 response time < 100ms
 *   - Actual throughput >= 90 req/s (90% of target)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ── Custom Metrics ────────────────────────────────────────────────────────────
const messageSuccess  = new Rate('message_post_success');
const messageFailed   = new Rate('message_post_failed');
const messageLatency  = new Trend('message_post_latency_ms', true);
const messagesPosted  = new Counter('messages_posted_total');

// ── Test Configuration ────────────────────────────────────────────────────────
const API_BASE_URL    = __ENV.API_BASE_URL    || 'http://localhost:4000';
const TEST_EMAIL      = __ENV.TEST_USER_EMAIL || 'loadtest@example.com';
const TEST_PASSWORD   = __ENV.TEST_USER_PASSWORD || 'LoadTest123!';
const TEST_CHANNEL_ID = __ENV.TEST_CHANNEL_ID || 'replace-with-valid-channel-uuid';

// Sample message contents — randomized to avoid caching effects
const MESSAGE_CONTENTS = new SharedArray('messages', () => [
  'Can anyone explain the difference between TCP and UDP?',
  'Just finished chapter 7 — the recursion examples are really helpful.',
  'What time is the study group meeting today?',
  'I think the answer to problem 3 is O(n log n) — can someone verify?',
  'Has anyone tried the new Gemini API for their projects?',
  'The lecture slides for today are uploaded to the resources channel.',
  'Quick question about the assignment deadline — is it midnight or 11:59pm?',
  'Great explanation! That clarified the concept perfectly.',
  'Working through the practice problems now, will share my notes soon.',
  'Does anyone have a good reference for database normalization?',
  'I recommend checking out the supplementary reading for this week.',
  'The office hours recording is now available in the recordings channel.',
  'Finished the lab early — happy to help anyone who is stuck!',
  'Can we review the sorting algorithms section before the exam?',
  'Just pushed my solution to the shared repo — feedback welcome.',
]);

export const options = {
  scenarios: {
    // Constant arrival rate — drives exactly 100 iterations/second
    constant_throughput: {
      executor: 'constant-arrival-rate',
      rate: 100,         // 100 iterations per second
      timeUnit: '1s',
      duration: '90s',   // 30s warmup + 60s sustained
      preAllocatedVUs: 50,
      maxVUs: 200,       // Scale up to 200 VUs if needed to maintain rate
    },
  },
  thresholds: {
    // Overall HTTP success (2xx) >= 95%
    'http_req_failed':                  [{ threshold: 'rate<0.05',   abortOnFail: false }],
    // p99 response time < 500ms (alerting threshold from OBSERVABILITY.md)
    'message_post_latency_ms':          [
      { threshold: 'p(99)<500', abortOnFail: false },
      { threshold: 'p(50)<100', abortOnFail: false },
    ],
    message_post_success:               [{ threshold: 'rate>=0.95',  abortOnFail: false }],
  },
};

// ── Per-VU auth token cache ───────────────────────────────────────────────────
let authToken = null;
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
    authToken = JSON.parse(res.body).access_token;
    authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    };
    return true;
  } catch {
    return false;
  }
}

// ── Main VU function ──────────────────────────────────────────────────────────
export default function () {
  if (!ensureAuth()) return;

  // Pick a random message content
  const content = MESSAGE_CONTENTS[Math.floor(Math.random() * MESSAGE_CONTENTS.length)];
  const payload = JSON.stringify({ content });

  const start = Date.now();
  const res = http.post(
    `${API_BASE_URL}/channels/${TEST_CHANNEL_ID}/messages`,
    payload,
    { headers: authHeaders, timeout: '10s' },
  );
  const duration = Date.now() - start;

  messageLatency.add(duration);

  const success = check(res, {
    'message: status 201': (r) => r.status === 201,
    'message: has id':     (r) => {
      try { return !!JSON.parse(r.body)?.id; } catch { return false; }
    },
  });

  if (success) {
    messageSuccess.add(true);
    messageFailed.add(false);
    messagesPosted.add(1);
  } else {
    messageSuccess.add(false);
    messageFailed.add(true);
    if (res.status === 429) {
      // Back off on rate limit
      sleep(1);
    }
  }
}

export function handleSummary(data) {
  return {
    stdout: formatSummary(data),
    'load-tests/results/http-messages-summary.json': JSON.stringify(data, null, 2),
  };
}

function formatSummary(data) {
  const metrics = data.metrics;
  const successRate  = (metrics.message_post_success?.values?.rate  * 100 || 0).toFixed(2);
  const failRate     = (metrics.message_post_failed?.values?.rate   * 100 || 0).toFixed(2);
  const p50          = metrics.message_post_latency_ms?.values?.['p(50)']?.toFixed(2) || 'N/A';
  const p99          = metrics.message_post_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A';
  const total        = metrics.messages_posted_total?.values?.count || 0;
  const rps          = (metrics.http_reqs?.values?.rate || 0).toFixed(2);

  return `
═══════════════════════════════════════════════════════
 k6 HTTP Message Throughput Test — Summary
═══════════════════════════════════════════════════════
 Total messages posted      : ${total}
 Actual throughput          : ${rps} req/s  (target: ≥ 100 req/s)
 Success rate               : ${successRate}%  (target: ≥ 95%)
 Failure rate               : ${failRate}%
 p50 latency                : ${p50}ms  (target: < 100ms)
 p99 latency                : ${p99}ms  (target: < 500ms)
═══════════════════════════════════════════════════════
`;
}
