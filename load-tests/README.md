# CollabStudy — Load Tests

k6 load testing scripts for CollabStudy performance benchmarking.
See `docs/PERFORMANCE_BENCHMARKS.md` for full documentation and target metrics.

## Quick Start

```bash
# Install k6
brew install k6          # macOS
choco install k6         # Windows
sudo apt install k6      # Ubuntu/Debian

# Run individual tests
pnpm test:load:ws        # WebSocket connections (1,000 concurrent)
pnpm test:load:messages  # HTTP message throughput (100 msg/s)
pnpm test:load:uploads   # File uploads (50 concurrent)
pnpm test:load:all       # Run all three sequentially

# Run with custom environment
k6 run load-tests/ws-connections.js \
  -e API_BASE_URL=https://api.collabstudy.com \
  -e TEST_USER_EMAIL=loadtest@example.com \
  -e TEST_USER_PASSWORD=LoadTest123! \
  -e TEST_CHANNEL_ID=<uuid>
```

Results are saved to `load-tests/results/` as JSON.
