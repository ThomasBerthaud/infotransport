import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import type { RequestHandler } from 'express';
import type { Budget } from './storage.js';

// A private registry keeps instrumentation isolated from other libraries and tests.
export function createMetrics(getBudget: () => ReturnType<Budget['counts']>) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const requests = new Counter({
    name: 'infotransport_http_requests_total',
    help: 'Completed HTTP requests (excluding metrics scrapes).',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'infotransport_http_request_duration_seconds',
    help: 'HTTP request duration until the response finishes or the connection closes.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15],
    registers: [registry],
  });
  const inFlight = new Gauge({
    name: 'infotransport_http_requests_in_flight',
    help: 'HTTP requests currently being processed (excluding metrics scrapes).',
    registers: [registry],
  });
  for (const [suffix, field] of [
    ['used', 'used'],
    ['limit', 'limit'],
    ['automatic_used', 'automatic'],
    ['automatic_limit', 'automaticLimit'],
  ] as const) {
    new Gauge({
      name: `infotransport_prim_quota_${suffix}`,
      help: `Local PRIM quota ${suffix} over a sliding 24-hour window, including failed calls.`,
      labelNames: ['api'],
      registers: [registry],
      collect() {
        for (const quota of getBudget().apis) this.set({ api: quota.api }, quota[field]);
      },
    });
  }
  const middleware: RequestHandler = (req, res, next) => {
    if (req.path === '/metrics') return next();
    const start = process.hrtime.bigint();
    inFlight.inc();
    let recorded = false;
    const complete = () => {
      if (recorded) return;
      recorded = true;
      inFlight.dec();
      // Route templates only: arbitrary paths, queries and PRIM identifiers never become labels.
      const route = req.route?.path;
      const labels = {
        method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method)
          ? req.method
          : 'OTHER',
        route:
          req.baseUrl === '/mcp' || req.path === '/mcp'
            ? '/mcp'
            : typeof route === 'string'
              ? route
              : 'other',
        status_code: String(res.writableFinished ? res.statusCode : 499),
      };
      requests.inc(labels);
      duration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
    };
    res.once('finish', complete);
    res.once('close', complete);
    next();
  };
  const handler: RequestHandler = async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  };
  return { registry, middleware, handler };
}
