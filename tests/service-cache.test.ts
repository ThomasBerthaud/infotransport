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
    await service.tick();
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

test('a pause starting mid-tick stops calls but still persists collected data', async () =>
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
    await service.tick();
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
    await service.tick();
    const views = service.dashboard().blocks;
    assert.deepEqual(
      views.map((v) => [v.block.id, v.incidents.map((i) => i.id)]),
      [
        ['a', ['d1']],
        ['b', ['d2']],
      ],
    );
  }));
