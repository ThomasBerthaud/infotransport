import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinimalBlock } from '../src/components/Block.js';
import { Service } from '../src/server/service.js';
import { Store } from '../src/server/storage.js';
import {
  demoConfig,
  departureWindow,
  isReachable,
  settings,
  type BlockView,
  type Departure,
  type Settings,
} from '../src/shared/model.js';

const NOW = '2026-10-26T10:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const departure = (minutes: number, cancelled = false): Departure => ({
  id: `d-${minutes}`,
  time: at(minutes),
  destination: 'Paris Saint-Lazare',
  lineRef: 'STIF:Line::C01740:',
  cancelled,
  realtime: true,
});
const block = demoConfig.profiles[0].blocks[0];
const view = (
  minutes: number[],
  overrides: Partial<Settings> = {},
  extra: Partial<BlockView> = {},
): BlockView => ({
  profileId: demoConfig.profiles[0].id,
  block,
  effective: { ...settings(demoConfig, block), minimalCount: 3, walkMinutes: 10, ...overrides },
  departures: minutes.map((m) => departure(m)),
  incidents: [],
  status: 'ok',
  trafficKnown: true,
  ...extra,
});
const render = (v: BlockView) =>
  renderToStaticMarkup(createElement(MinimalBlock, { view: v, now: NOW }));
const cells = (html: string) =>
  [...html.matchAll(/<td[^>]*><strong>(?:<span[^>]*><\/span>)?([^<]*)/g)].map((m) => m[1]);
const MARKER = /class="minimal-hidden-marker" aria-hidden="true"/;

test('isReachable keeps a departure exactly at the walking threshold', () => {
  assert.equal(isReachable(at(9), NOW, 10), false);
  assert.equal(isReachable(at(10), NOW, 10), true);
  assert.equal(isReachable(at(0), NOW, 0), true);
});

test('minimal block hides departures under the threshold and shifts the next ones in', () => {
  const html = render(view([3, 10, 18, 26]));
  assert.deepEqual(cells(html), ['10', '18', '26']);
  assert.doesNotMatch(html, /too-close/);
  assert.match(html, MARKER);
  assert.equal(html.match(/minimal-hidden-marker/g)?.length, 1);
  assert.match(html, /aria-label="[^"]*, départs trop proches masqués"/);
});

test('missing reachable departures leave dashes, with the marker before them', () => {
  assert.deepEqual(cells(render(view([3, 12]))), ['12', '—', '—']);
  const none = render(view([2, 5]));
  assert.deepEqual(cells(none), ['—', '—', '—']);
  assert.match(
    none,
    /<td><strong><span class="minimal-hidden-marker" aria-hidden="true"><\/span>—/,
  );
});

test('a block walkMinutes override is respected', () => {
  assert.deepEqual(cells(render(view([3, 10, 18, 26], { walkMinutes: 15 }))), ['18', '26', '—']);
  assert.deepEqual(cells(render(view([3, 10, 18, 26], { walkMinutes: 2 }))), ['3', '10', '18']);
});

test('no marker when nothing is hidden, the threshold is zero or the block is paused', () => {
  const none = render(view([12, 20, 28]));
  assert.doesNotMatch(none, MARKER);
  assert.doesNotMatch(none, /masqués/);
  const zero = render(view([0, 1, 2], { walkMinutes: 0 }));
  assert.deepEqual(cells(zero), ['0', '1', '2']);
  assert.doesNotMatch(zero, MARKER);
  assert.doesNotMatch(render(view([], {}, { status: 'paused', trafficKnown: false })), MARKER);
});

test('a cancelled reachable departure still reads SUP.', () => {
  const v = view([]);
  v.departures = [departure(3, true), departure(12, true), departure(20)];
  assert.deepEqual(cells(render(v)), ['SUP.', '20', '—']);
});

test('departureWindow keeps richCount and extends to minimalCount reachable departures', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8].map((m) => departure(m));
  const window = (richCount: number, minimalCount: number, walkMinutes: number) =>
    departureWindow(list, NOW, { richCount, minimalCount, walkMinutes }).map((d) => d.id);
  assert.equal(window(3, 2, 0).length, 3);
  assert.deepEqual(window(3, 3, 5), ['d-1', 'd-2', 'd-3', 'd-4', 'd-5', 'd-6', 'd-7']);
  assert.equal(window(3, 5, 7).length, 8);
  assert.equal(window(10, 1, 0).length, 8);
});

test('dashboard provides enough reachable departures with a low richCount and a high threshold', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-reachable-'));
  try {
    const service = new Service(new Store(dir), '');
    await service.init();
    service.config = {
      ...service.config,
      defaults: { ...service.config.defaults, richCount: 3, minimalCount: 3, walkMinutes: 40 },
    };
    const dashboard = service.dashboard(new Date(NOW));
    for (const v of dashboard.blocks) {
      if (v.status === 'paused') continue;
      assert.ok(v.departures.length >= 3);
      const reachable = v.departures.filter((d) => isReachable(d.time, dashboard.now, 40));
      assert.equal(reachable.length, 3);
      const html = renderToStaticMarkup(
        createElement(MinimalBlock, { view: v, now: dashboard.now }),
      );
      assert.doesNotMatch(cells(html).join(), /—/);
      assert.match(html, MARKER);
    }
    assert.ok(dashboard.blocks.some((v) => v.status !== 'paused'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('preview dashboard covers a draft threshold and count higher than the saved ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-preview-'));
  try {
    const service = new Service(new Store(dir), '');
    await service.init();
    service.config = {
      ...service.config,
      defaults: { ...service.config.defaults, richCount: 3, minimalCount: 1, walkMinutes: 0 },
    };
    const now = new Date(NOW);
    const saved = service.dashboard(now).blocks.find((v) => v.status !== 'paused')!;
    const preview = service
      .dashboard(now, { preview: true })
      .blocks.find((v) => v.block.id === saved.block.id)!;
    assert.equal(saved.departures.length, 3);
    // The draft raises the threshold and count: the saved window lacks reachable departures.
    const draft = { ...saved.effective, minimalCount: 5, walkMinutes: 120 };
    const reachable = (v: BlockView) =>
      v.departures.filter((d) => isReachable(d.time, now.toISOString(), 120)).length;
    assert.equal(reachable(saved), 0);
    assert.equal(reachable(preview), 5);
    assert.doesNotMatch(cells(render({ ...preview, effective: draft })).join(), /—/);
    // The detailed view keeps its own, smaller payload, starting with the same departures.
    assert.ok(saved.departures.every((d, i) => d.id === preview.departures[i].id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
