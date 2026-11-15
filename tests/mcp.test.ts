import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpRouter } from '../src/server/mcp.js';
import { Service } from '../src/server/service.js';
import { Store } from '../src/server/storage.js';

const data = (result: Record<string, unknown>) =>
  result.structuredContent as Record<string, unknown>;

test('MCP HTTP exposes site data read-only without provider calls or persistent sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-mcp-'));
  const service = new Service(new Store(dir), '');
  await service.init();
  service.config.defaults.start = service.config.defaults.end = '00:00';
  service.prim.request = async () => {
    assert.fail('MCP must never call PRIM');
  };
  const originalConfig = JSON.stringify(service.config);
  const originalCache = JSON.stringify(service.cache);
  const originalBudget = JSON.stringify(service.budget.counts());
  const app = express();
  app.use(express.json());
  app.use('/mcp', createMcpRouter(service));
  const http = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => http.once('listening', resolve));
  const address = http.address();
  assert.ok(address && typeof address !== 'string');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(url));
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'get_dashboard',
      'get_status',
      'get_stop_lines',
      'get_traffic',
      'search_stops',
    ]);
    assert.ok(tools.tools.every((tool) => tool.annotations?.readOnlyHint));
    const dashboard = await client.callTool({ name: 'get_dashboard', arguments: {} });
    assert.equal(dashboard.isError, undefined);
    assert.equal(data(dashboard).mode, 'demo');
    assert.deepEqual(
      dashboard.structuredContent,
      JSON.parse(JSON.stringify(service.dashboard(new Date(String(data(dashboard).now))))),
    );
    const traffic = await client.callTool({ name: 'get_traffic', arguments: {} });
    assert.equal(data(traffic).mode, 'demo');
    assert.ok(Array.isArray(data(traffic).blocks));
    const stops = await client.callTool({
      name: 'search_stops',
      arguments: { query: 'La Défense' },
    });
    assert.deepEqual(stops.structuredContent, { stops: await service.search('La Défense') });
    const monitoringRef = (await service.search('La Défense'))[0].monitoringRef;
    const lines = await client.callTool({ name: 'get_stop_lines', arguments: { monitoringRef } });
    assert.deepEqual(lines.structuredContent, {
      monitoringRef,
      lines: service.catalog.lines(monitoringRef),
    });
    const status = await client.callTool({ name: 'get_status', arguments: {} });
    assert.deepEqual(status.structuredContent, JSON.parse(JSON.stringify(service.diagnostics())));
    for (const [name, args] of [
      ['search_stops', { query: 'x' }],
      ['get_stop_lines', { monitoringRef: 'invalid' }],
    ] as const) {
      const invalid = await client.callTool({ name, arguments: args });
      assert.equal(invalid.isError, true);
    }
    await assert.rejects(
      client.callTool({ name: 'save_config', arguments: {} }),
      /Tool save_config not found/,
    );
    const resources = await client.listResources();
    assert.equal(resources.resources.length, 2);
    const resource = await client.readResource({ uri: 'infotransport://dashboard' });
    assert.ok('text' in resource.contents[0]);
    assert.equal(JSON.parse(resource.contents[0].text as string).mode, 'demo');
    assert.equal(JSON.stringify(service.config), originalConfig);
    assert.equal(JSON.stringify(service.cache), originalCache);
    assert.equal(JSON.stringify(service.budget.counts()), originalBudget);

    const modern = new Client(
      { name: 'modern-integration-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    try {
      await modern.connect(new StreamableHTTPClientTransport(url));
      assert.ok(modern.getDiscoverResult());
      const snapshot = await modern.callTool({ name: 'get_dashboard', arguments: {} });
      assert.equal(data(snapshot).mode, 'demo');
    } finally {
      await modern.close();
    }

    service.config.defaults.days = [];
    const paused = await client.callTool({ name: 'get_dashboard', arguments: {} });
    assert.equal(data(paused).paused, true);
    const blocks = data(paused).blocks as { departures: unknown[]; status: string }[];
    assert.ok(blocks.every((block) => block.status === 'paused' && !block.departures.length));
    for (const method of ['GET', 'DELETE']) {
      const response = await fetch(url, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'POST');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dir, { recursive: true, force: true });
  }
});
