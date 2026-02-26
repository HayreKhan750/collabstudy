/**
 * k6 Load Test — WebSocket Connection Scaling
 * ============================================
 * Target: 1,000 concurrent authenticated WebSocket connections held open
 *         for 60 seconds, measuring connection success rate and latency.
 *
 * Run:
 *   k6 run load-tests/ws-connections.js \
 *     -e API_BASE_URL=http://localhost:4000 \
 *     -e TEST_USER_EMAIL=loadtest@example.com \
 *     -e TEST_USER_PASSWORD=LoadTest123! \
 *     -e TEST_CHANNEL_ID=<uuid>
 *
 * Pass/Fail Thresholds:
 *   - WS connection success rate >= 99%
 *   - WS session error rate < 1%
 *   - p95 connection time < 500ms
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom Metrics ────────────────────────────────────────────────────────────
const wsConnectSuccess = new Rate('ws_connect_success');
const wsConnectErrors  = new Rate('ws_connect_errors');
const wsConnectTime    = new Trend('ws_connect_time_ms', true);
const wsMessagesReceived = new Counter('ws_messages_received');

// ── Test Configuration ────────────────────────────────────────────────────────
const API_BASE_URL    = __ENV.API_BASE_URL    || 'http://localhost:4000';
const WS_BASE_URL     = API_BASE_URL.replace(/^http/, 'ws');
const TEST_EMAIL      = __ENV.TEST_USER_EMAIL || 'loadtest@example.com';
const TEST_PASSWORD   = __ENV.TEST_USER_PASSWORD || 'LoadTest123!';
const TEST_CHANNEL_ID = __ENV.TEST_CHANNEL_ID || 'replace-with-valid-channel-uuid';

export const options = {
  scenarios: {
    websocket_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200  }, // Ramp to 200 connections in 30s
        { duration: '30s', target: 500  }, // Ramp to 500 connections in 30s
        { duration: '30s', target: 1000 }, // Ramp to 1,000 connections in 30s
        { duration: '60s', target: 1000 }, // Hold 1,000 connections for 60s
        { duration: '15s', target: 0    }, // Ramp down gracefully
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    ws_connect_success:    [{ threshold: 'rate>=0.99', abortOnFail: false }],  // 99%+ success
    ws_connect_errors:     [{ threshold: 'rate<0.01',  abortOnFail: false }],  // <1% errors
    ws_connect_time_ms:    [{ threshold: 'p(95)<500',  abortOnFail: false }],  // p95 < 500ms
  },
};

// ── Shared auth token (set once per VU lifecycle) ─────────────────────────────
let authToken = null;

function authenticate() {
  const res = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const success = check(res, {
    'auth: status 200': (r) => r.status === 200,
    'auth: token present': (r) => {
      try {
        return !!JSON.parse(r.body)?.access_token;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    console.error(`Auth failed for VU ${__VU}: ${res.status} ${res.body}`);
    return null;
  }

  return JSON.parse(res.body).access_token;
}

// ── Main VU function ──────────────────────────────────────────────────────────
export default function () {
  // Authenticate once per VU
  if (!authToken) {
    authToken = authenticate();
    if (!authToken) return; // Skip this VU iteration if auth fails
  }

  const connectStart = Date.now();

  const url = `${WS_BASE_URL}/socket.io/?transport=websocket&EIO=4`;

  const response = ws.connect(url, { headers: { Authorization: `Bearer ${authToken}` } }, (socket) => {
    const elapsed = Date.now() - connectStart;
    wsConnectTime.add(elapsed);
    wsConnectSuccess.add(true);

    // Send Socket.io handshake upgrade
    socket.on('open', () => {
      // Socket.io EIO4 requires a "40" packet to initialize the session
      socket.send('40');
    });

    socket.on('message', (data) => {
      wsMessagesReceived.add(1);

      // After Socket.io session is established, join the test channel room
      if (data === '40') {
        // Join channel: Socket.io event payload format
        socket.send(`42["join_channel",{"channelId":"${TEST_CHANNEL_ID}"}]`);
      }
    });

    socket.on('error', (e) => {
      wsConnectErrors.add(true);
      wsConnectSuccess.add(false);
    });

    // Hold the connection open for the duration of the hold stage
    sleep(90);

    socket.close();
  });

  check(response, {
    'ws: connection established': (r) => r && r.status === 101,
  });
}

export function handleSummary(data) {
  return {
    stdout: formatSummary(data),
    'load-tests/results/ws-connections-summary.json': JSON.stringify(data, null, 2),
  };
}

function formatSummary(data) {
  const metrics = data.metrics;
  const successRate = (metrics.ws_connect_success?.values?.rate * 100 || 0).toFixed(2);
  const errorRate   = (metrics.ws_connect_errors?.values?.rate  * 100 || 0).toFixed(2);
  const p95         = metrics.ws_connect_time_ms?.values?.['p(95)']?.toFixed(2) || 'N/A';
  const maxVUs      = metrics.vus_max?.values?.max || 'N/A';

  return `
═══════════════════════════════════════════════════════
 k6 WebSocket Connection Test — Summary
═══════════════════════════════════════════════════════
 Max concurrent connections : ${maxVUs}
 Connection success rate    : ${successRate}%  (target: ≥ 99%)
 Connection error rate      : ${errorRate}%   (target: < 1%)
 p95 connection time        : ${p95}ms         (target: < 500ms)
 Total WS messages received : ${metrics.ws_messages_received?.values?.count || 0}
═══════════════════════════════════════════════════════
`;
}
