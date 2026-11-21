import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.js';
import { UpstreamError } from '../src/server/errors.js';
import { Service } from '../src/server/service.js';
import { Store } from '../src/server/storage.js';
import { initialConfig, type Block, type Dashboard } from '../src/shared/model.js';

type Harness = { base: string; service: Service; dir: string };

async function withApp(
  key: string,
  fn: (h: Harness) => Promise<void>,
  prepare?: (dir: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-http-'));
  try {
    await prepare?.(dir);
    const service = new Service(new Store(dir), key);
    await service.init();
    service.prim.request = async () => {
      throw new UpstreamError('PRIM : HTTP 500.');
    };
    const server = createApp(service, { production: false }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await fn({ base: `http://127.0.0.1:${port}`, service, dir });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const block = (patch: Partial<Block> = {}): Block => ({
  id: 'b0',
  station: 'A',
  line: 'L',
  direction: 'D',
  monitoringRef: 'STIF:StopArea:SP:123:',
  lineRef: 'STIF:Line::C01740:',
  directionRef: 'outbound',
  destinationRef: '',
  span: 2,
  overrides: {},
  ...patch,
});

const allDay = () => {
  const c = structuredClone(initialConfig);
  c.defaults.start = c.defaults.end = '00:00';
  return c;
};

test('health, dashboard and minimal view respond with the expected headers', async () =>
  withApp('', async ({ base }) => {
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    const dashboard = await fetch(`${base}/api/dashboard`);
    assert.equal(dashboard.headers.get('cache-control'), 'no-store');
    assert.equal(((await dashboard.json()) as { mode: string }).mode, 'demo');
    const preview = await fetch(`${base}/api/dashboard?preview=1`);
    assert.equal(preview.status, 200);
    assert.equal(((await preview.json()) as { mode: string }).mode, 'demo');
    const minimal = await fetch(`${base}/minimal`);
    assert.equal(minimal.status, 200);
    const html = await minimal.text();
    assert.match(html, /<link rel="stylesheet" href="\/minimal.css">/);
    assert.match(html, /http-equiv="refresh"/);
    assert.equal(html.match(/class="minimal-cell"/g)?.length, 2);
  }));

test('validation errors are 400, upstream failures 502 and local pauses 503', async () =>
  withApp('test-key', async ({ base, service }) => {
    assert.equal((await fetch(`${base}/api/stops?q=a`)).status, 400);
    assert.equal((await fetch(`${base}/api/discover?ref=nope`)).status, 400);
    const duplicate = allDay();
    duplicate.profiles[0].blocks = [block(), block()];
    const put = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicate),
    });
    assert.equal(put.status, 400);
    assert.match(((await put.json()) as { error: string }).error, /identifiant unique/);
    const malformed = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.status, 400);

    await service.save(allDay());
    const upstream = await fetch(`${base}/api/discover?ref=STIF:StopArea:SP:123:`);
    assert.equal(upstream.status, 502);
    assert.match(((await upstream.json()) as { error: string }).error, /PRIM : HTTP 500/);

    service.config.defaults.days = [];
    assert.equal((await fetch(`${base}/api/discover?ref=STIF:StopArea:SP:124:`)).status, 503);
  }));

test('unexpected errors are 500 without leaking internal details', async () =>
  withApp('', async ({ base, service }) => {
    service.dashboard = () => {
      throw new Error('secret internal state');
    };
    const response = await fetch(`${base}/api/dashboard`);
    assert.equal(response.status, 500);
    const { error } = (await response.json()) as { error: string };
    assert.doesNotMatch(error, /secret/);
  }));

test('cross-site requests cannot write the configuration or spend PRIM quota', async () =>
  withApp('test-key', async ({ base, service }) => {
    await service.save(allDay());
    let calls = 0;
    service.prim.request = async () => {
      calls++;
      throw new UpstreamError('PRIM : HTTP 500.');
    };
    const discover = `${base}/api/discover?ref=STIF:StopArea:SP:123:`;
    assert.equal(
      (await fetch(discover, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
      403,
    );
    assert.equal(
      (await fetch(discover, { headers: { 'Sec-Fetch-Site': 'same-site' } })).status,
      403,
    );
    assert.equal((await fetch(discover, { headers: { Origin: 'http://evil.test' } })).status, 403);
    assert.equal(calls, 0);
    assert.equal(
      (await fetch(discover, { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status,
      502,
    );
    assert.equal(calls, 1);
    const put = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'null' },
      body: JSON.stringify(allDay()),
    });
    assert.equal(put.status, 403);
  }));

test('an invalid stored configuration is set aside instead of preventing startup', async () =>
  withApp(
    'test-key',
    async ({ base, service, dir }) => {
      assert.match(service.configError ?? '', /config\.json\.invalid-/);
      assert.equal(service.config.profiles[0].blocks.length, 0);
      const files = await readdir(dir);
      const saved = files.find((name) => name.startsWith('config.json.invalid-'));
      assert.ok(saved);
      assert.match(await readFile(join(dir, saved), 'utf8'), /"version": 99/);
      const status = (await (await fetch(`${base}/api/status`)).json()) as {
        configError?: string;
        catalog: { importedAt?: string };
      };
      assert.equal(status.configError, service.configError);
      assert.ok(status.catalog.importedAt);
      await service.save(allDay());
      assert.equal(service.configError, undefined);
    },
    (dir) => writeFile(join(dir, 'config.json'), JSON.stringify({ version: 99 }, null, 2)),
  ));

test('unreadable configuration JSON is quarantined too', async () =>
  withApp(
    'test-key',
    async ({ service }) => {
      assert.match(service.configError ?? '', /illisible/);
    },
    (dir) => writeFile(join(dir, 'config.json'), '{ not json'),
  ));

test('production serves the service worker and manifest for the rich view only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-client-'));
  const data = await mkdtemp(join(tmpdir(), 'infotransport-data-'));
  try {
    await mkdir(join(dir, '.vite'));
    await writeFile(join(dir, 'index.html'), '<link rel="manifest" href="/manifest.webmanifest">');
    await writeFile(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    await writeFile(join(dir, 'manifest.webmanifest'), '{"name":"InfoTransport"}');
    await writeFile(
      join(dir, '.vite/manifest.json'),
      JSON.stringify({ 'src/client/minimal.css': { file: 'assets/minimal.css' } }),
    );
    const service = new Service(new Store(data), '');
    await service.init();
    const server = createApp(service, { production: true, clientDir: dir }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const sw = await fetch(`${base}/sw.js`);
      assert.equal(sw.status, 200);
      assert.equal(sw.headers.get('cache-control'), 'no-cache');
      assert.match(sw.headers.get('content-type') ?? '', /javascript/);
      const manifest = await fetch(`${base}/manifest.webmanifest`);
      assert.match(manifest.headers.get('content-type') ?? '', /^application\/manifest\+json/);
      assert.match(await (await fetch(`${base}/admin`)).text(), /rel="manifest"/);
      const minimal = await (await fetch(`${base}/minimal`)).text();
      assert.doesNotMatch(minimal, /manifest|serviceWorker|sw\.js/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(data, { recursive: true, force: true });
  }
});

test('timetables are served for the configured blocks once imported', async () =>
  withApp('test-key', async ({ base, service, dir }) => {
    const config = allDay();
    config.profiles[0].blocks = [block()];
    await service.save(config);
    const missing = await fetch(`${base}/api/timetables`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    let status = (await (await fetch(`${base}/api/status`)).json()) as {
      timetables: { state: string };
    };
    assert.equal(status.timetables.state, 'missing');
    const before = (await (await fetch(`${base}/api/dashboard`)).json()) as Dashboard;
    assert.equal(before.timetables, undefined);
    const soon = new Date(Date.now() + 10 * 60000).toISOString();
    const b = block();
    await writeFile(
      join(dir, 'timetables.json'),
      JSON.stringify({
        version: 1,
        source: 'test',
        importedAt: '2026-11-20T08:00:00.000Z',
        validFrom: '2026-11-20T08:00:00.000Z',
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        entries: [
          {
            key: {
              monitoringRef: b.monitoringRef,
              lineRef: b.lineRef,
              directionRef: b.directionRef,
              destinationRef: b.destinationRef,
            },
            label: 'A · L → D',
            departures: [{ time: soon, destination: 'D' }],
          },
        ],
      }),
    );
    const dashboard = (await (await fetch(`${base}/api/dashboard`)).json()) as Dashboard;
    assert.equal(dashboard.timetables, '2026-11-20T08:00:00.000Z');
    const timetables = (await (await fetch(`${base}/api/timetables`)).json()) as {
      blocks: Record<string, { time: string }[]>;
    };
    assert.deepEqual(timetables.blocks.b0, [{ time: soon, destination: 'D' }]);
    status = (await (await fetch(`${base}/api/status`)).json()) as typeof status;
    assert.equal(status.timetables.state, 'ok');
  }));

test('a stored v1 configuration starts as a single default profile without quarantine', async () =>
  withApp(
    'test-key',
    async ({ base, service, dir }) => {
      assert.equal(service.configError, undefined);
      assert.deepEqual(
        service.config.profiles.map((p) => [p.id, p.name, p.grid, p.blocks.length]),
        [['principal', 'Principal', { columns: 1, rows: 3 }, 1]],
      );
      assert.equal(service.config.defaultProfileId, 'principal');
      assert.ok(!(await readdir(dir)).some((name) => name.includes('invalid')));
      // The file is rewritten in version 2 at startup.
      const stored = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'));
      assert.equal(stored.version, 2);
      const dashboard = (await (await fetch(`${base}/api/dashboard`)).json()) as Dashboard;
      assert.deepEqual(
        dashboard.blocks.map((v) => [v.profileId, v.block.id]),
        [['principal', 'b0']],
      );
      // A v1 configuration sent by an older admin page is still accepted.
      const put = await fetch(`${base}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          defaults: initialConfig.defaults,
          screen: { width: 800, height: 600, refreshSeconds: 60, columns: 2 },
          blocks: [block()],
        }),
      });
      assert.equal(put.status, 200);
      assert.equal(((await put.json()) as { version: number }).version, 2);
    },
    (dir) =>
      writeFile(
        join(dir, 'config.json'),
        JSON.stringify({
          version: 1,
          defaults: initialConfig.defaults,
          screen: { width: 800, height: 600, refreshSeconds: 60, columns: 1, rows: 3 },
          blocks: [block()],
        }),
      ),
  ));

test('the minimal view shows the default profile; ?profile= filters the dashboard', async () =>
  withApp('', async ({ base, service }) => {
    const all = (await (await fetch(`${base}/api/dashboard`)).json()) as Dashboard;
    assert.deepEqual(
      all.blocks.map((v) => v.profileId),
      ['la-defense', 'la-defense', 'saint-lazare'],
    );
    const one = (await (
      await fetch(`${base}/api/dashboard?preview=1&profile=saint-lazare`)
    ).json()) as Dashboard;
    assert.deepEqual(
      one.blocks.map((v) => v.block.id),
      ['saint-lazare-l'],
    );
    assert.equal((await fetch(`${base}/api/dashboard?profile=nope`)).status, 404);
    let html = await (await fetch(`${base}/minimal`)).text();
    assert.equal(html.match(/class="minimal-cell"/g)?.length, 2);
    assert.match(html, /La Verrière/);
    const config = structuredClone(service.config);
    config.defaultProfileId = 'saint-lazare';
    await service.save(config);
    html = await (await fetch(`${base}/minimal`)).text();
    assert.equal(html.match(/class="minimal-cell"/g)?.length, 1);
    assert.match(html, /Versailles Rive Droite/);
    assert.doesNotMatch(html, /La Verrière/);
    // The saint-lazare grid has a single row: its cell takes the full height.
    assert.match(html, /height:100%/);
  }));
