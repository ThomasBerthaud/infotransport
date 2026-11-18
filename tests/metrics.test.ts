import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createMetrics } from '../src/server/metrics.js';
import { Budget, Store, type BudgetState } from '../src/server/storage.js';

test('metrics expose persisted sliding quotas and bounded HTTP labels without consuming budget', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-metrics-'));
  const store = new Store(dir);
  const now = Date.now();
  await store.write('budget.json', {
    reservations: [
      { api: 'stop-monitoring', automatic: true, at: now },
      { api: 'stop-monitoring', automatic: false, at: now },
      { api: 'line-reports', automatic: true, at: now - 86400001 },
    ],
  });
  const budget = new Budget(
    store,
    await store.read<BudgetState>('budget.json', { reservations: [] }),
  );
  const metrics = createMetrics(() => budget.counts());
  const app = express();
  app.use(metrics.middleware);
  app.get('/metrics', metrics.handler);
  app.get('/api/stops', (_req, res) => res.status(400).json({ error: 'invalid query' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await fetch(`${base}/api/stops?q=secret-stop`);
    await fetch(`${base}/random-path-123?q=secret`);
    const before = budget.counts();
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/metrics`);
      assert.match(response.headers.get('content-type')!, /text\/plain/);
      const body = await response.text();
      assert.match(body, /infotransport_prim_quota_used\{api="stop-monitoring"\} 2/);
      assert.match(body, /infotransport_prim_quota_automatic_used\{api="stop-monitoring"\} 1/);
      assert.match(body, /infotransport_prim_quota_used\{api="line-reports"\} 0/);
      assert.match(body, /infotransport_prim_quota_limit\{api="line-reports"\} 1000/);
      assert.match(body, /infotransport_prim_quota_automatic_limit\{api="line-reports"\} 900/);
      assert.match(
        body,
        /infotransport_http_requests_total\{method="GET",route="\/api\/stops",status_code="400"\} 1/,
      );
      assert.match(
        body,
        /infotransport_http_requests_total\{method="GET",route="other",status_code="404"\} 1/,
      );
      assert.match(
        body,
        /infotransport_http_request_duration_seconds_count\{method="GET",route="\/api\/stops",status_code="400"\} 1/,
      );
      assert.match(body, /infotransport_http_requests_in_flight 0/);
      assert.match(body, /process_cpu_seconds_total/);
      assert.match(body, /process_resident_memory_bytes/);
      assert.doesNotMatch(body, /secret|random-path|route="\/metrics"/);
    }
    assert.deepEqual(budget.counts(), before);
    // Collect-time gauges reflect new reservations rather than a cached startup snapshot.
    await budget.reserve('line-reports', true);
    assert.match(
      await metrics.registry.metrics(),
      /infotransport_prim_quota_used\{api="line-reports"\} 1/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    metrics.registry.clear();
    await rm(dir, { recursive: true, force: true });
  }
});
