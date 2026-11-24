import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Service } from '../src/server/service.js';
import { Store } from '../src/server/storage.js';
import { initialConfig, type Block } from '../src/shared/model.js';

const withDirectory = async (fn: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-cache-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
const block = (id: string, stop: string, line: string): Block => ({
  id,
  station: 'A',
  line: 'L',
  direction: 'D',
  monitoringRef: `STIF:StopArea:SP:${stop}:`,
  lineRef: `STIF:Line::C0${line}:`,
  directionRef: 'outbound',
  destinationRef: '',
  span: 2,
  overrides: {},
});
const emptyStop = { Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ Status: true }] } } };
const emptyTraffic = { disruptions: [], line_reports: [] };
const allDay = (blocks: Block[]) => {
  const c = structuredClone(initialConfig);
  c.defaults.start = c.defaults.end = '00:00';
  c.profiles[0].blocks = blocks;
  return c;
};

test('cache entries of removed blocks are pruned and legacy search cache is dropped', async () =>
  withDirectory(async (dir) => {
    await writeFile(
      join(dir, 'cache.json'),
      JSON.stringify({ stops: {}, traffic: {}, searches: { old: { at: 1, data: [] } } }),
    );
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    assert.equal('searches' in service.cache, false);
    service.prim.request = async (path) => (path === 'stop-monitoring' ? emptyStop : emptyTraffic);
    await service.save(allDay([block('a', '1', '1'), block('b', '2', '2')]));
    await service.refresh();
    assert.deepEqual(Object.keys(service.cache.stops).sort(), [
      'STIF:StopArea:SP:1:',
      'STIF:StopArea:SP:2:',
    ]);
    // A recent discovery lookup survives pruning; old unused entries do not.
    service.cache.stops['STIF:StopArea:SP:9:'] = { at: Date.now(), data: [], next: 0 };
    for (const entry of Object.values(service.cache.stops)) entry.at = Date.now() - 3_600_000;
    service.cache.stops['STIF:StopArea:SP:9:'].at = Date.now();
    await service.save(allDay([block('a', '1', '1')]));
    assert.deepEqual(Object.keys(service.cache.stops).sort(), [
      'STIF:StopArea:SP:1:',
      'STIF:StopArea:SP:9:',
    ]);
    assert.deepEqual(Object.keys(service.cache.traffic), ['STIF:Line::C01:']);
    const persisted = JSON.parse(await readFile(join(dir, 'cache.json'), 'utf8')) as {
      stops: object;
    };
    assert.equal('STIF:StopArea:SP:2:' in persisted.stops, false);
  }));

test('a pause starting mid-collection stops calls but still persists collected data', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    await service.save(allDay([block('a', '1', '1'), block('b', '2', '2')]));
    const calls: string[] = [];
    service.prim.request = async (path) => {
      calls.push(path);
      // The night pause begins right after the first collection.
      service.config.defaults.days = [];
      return emptyStop;
    };
    await service.refresh();
    assert.deepEqual(calls, ['stop-monitoring']);
    assert.equal(service.error, undefined);
    const persisted = JSON.parse(await readFile(join(dir, 'cache.json'), 'utf8')) as {
      stops: Record<string, unknown>;
    };
    assert.ok(persisted.stops['STIF:StopArea:SP:1:']);
  }));

test('each block only shows the disruptions of its own line', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    const disruption = (id: string, line: string) => ({
      id,
      status: 'active',
      messages: [{ text: `Info ${id}`, channel: { types: ['web'] } }],
      impacted_objects: [{ pt_object: { embedded_type: 'line', id: `line:IDFM:C0${line}` } }],
    });
    // A shared station makes both lines' reports return both disruptions.
    const traffic = {
      disruptions: [disruption('d1', '1'), disruption('d2', '2')],
      line_reports: [],
    };
    service.prim.request = async (path) => (path === 'stop-monitoring' ? emptyStop : traffic);
    await service.save(allDay([block('a', '1', '1'), block('b', '1', '2')]));
    await service.refresh();
    const views = service.dashboard().blocks;
    assert.deepEqual(
      views.map((v) => [v.block.id, v.incidents.map((i) => i.id)]),
      [
        ['a', ['d1']],
        ['b', ['d2']],
      ],
    );
  }));

const count = (calls: string[], path: string) => calls.filter((c) => c === path).length;
const liveService = async (dir: string, blocks: Block[]) => {
  const service = new Service(new Store(dir), 'test-key');
  await service.init();
  await service.save(allDay(blocks));
  const calls: string[] = [];
  service.prim.request = async (path) => {
    calls.push(path);
    return path === 'stop-monitoring' ? emptyStop : emptyTraffic;
  };
  return { service, calls };
};

test('without any page request, PRIM is never called', async () =>
  withDirectory(async (dir) => {
    const { calls } = await liveService(dir, [block('a', '1', '1')]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(calls, []);
  }));

test('a page request collects due resources; the next one reads the cache', async () =>
  withDirectory(async (dir) => {
    const { service, calls } = await liveService(dir, [
      block('a', '1', '1'),
      block('b', '1', '2'),
      block('c', '2', '2'),
    ]);
    await service.demand();
    assert.equal(count(calls, 'stop-monitoring'), 2);
    assert.equal(count(calls, 'line-reports'), 2);
    await service.demand();
    service.dashboard();
    assert.equal(calls.length, 4);
    // Once the poll interval has elapsed, the next request collects the stops again.
    for (const entry of Object.values(service.cache.stops)) entry.next = 0;
    await service.demand();
    assert.equal(count(calls, 'stop-monitoring'), 4);
    assert.equal(calls.length, 6);
  }));

test('concurrent page requests share a single collection', async () =>
  withDirectory(async (dir) => {
    const { service, calls } = await liveService(dir, [block('a', '1', '1')]);
    const request = service.prim.request;
    service.prim.request = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return request(...args);
    };
    await Promise.all([service.demand(), service.demand(), service.demand()]);
    assert.deepEqual(calls, ['stop-monitoring', 'line-reports']);
  }));

test('a page request waits a bounded time, then the collection completes in background', async () =>
  withDirectory(async (dir) => {
    const { service, calls } = await liveService(dir, [block('a', '1', '1')]);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    service.prim.request = async (path) => {
      calls.push(path);
      await blocked;
      return path === 'stop-monitoring' ? emptyStop : emptyTraffic;
    };
    const started = Date.now();
    await service.demand({ waitMs: 50 });
    assert.ok(Date.now() - started < 1000);
    assert.equal(service.cache.stops['STIF:StopArea:SP:1:'], undefined);
    // Stops and traffic are collected in parallel. A request made meanwhile joins the
    // running collection instead of calling again.
    assert.deepEqual(calls, ['stop-monitoring', 'line-reports']);
    await service.demand({ waitMs: 10 });
    assert.deepEqual(calls, ['stop-monitoring', 'line-reports']);
    release();
    await service.refresh();
    assert.ok(service.cache.stops['STIF:StopArea:SP:1:']);
    assert.deepEqual(calls, ['stop-monitoring', 'line-reports']);
    assert.equal(service.error, undefined);
  }));

test('page requests call nothing during a pause or in demo mode', async () =>
  withDirectory(async (dir) => {
    const { service, calls } = await liveService(dir, [block('a', '1', '1')]);
    service.config.defaults.days = [];
    await service.demand();
    assert.deepEqual(calls, []);
    const demo = new Service(new Store(dir), '');
    await demo.init();
    demo.prim.request = async () => {
      throw new Error('Unexpected upstream access');
    };
    await demo.demand();
    assert.equal(demo.error, undefined);
  }));

test('an unexpected collection error is reported without rejecting the request', async () =>
  withDirectory(async (dir) => {
    const { service } = await liveService(dir, [block('a', '1', '1')]);
    const write = Store.prototype.write;
    Store.prototype.write = async () => {
      throw new Error('disque plein');
    };
    try {
      await service.demand();
    } finally {
      Store.prototype.write = write;
    }
    assert.equal(service.error, 'disque plein');
  }));
