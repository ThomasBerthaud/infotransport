import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  active,
  Block,
  estimatedCalls,
  estimatedCallsByApi,
  initialConfig,
  layout,
  minimalWarnings,
  refreshDelay,
  settings,
  validateConfig,
} from '../src/shared/model.js';
import { Budget, Store } from '../src/server/storage.js';
import { Service } from '../src/server/service.js';
import {
  lineReportsPath,
  navitiaDate,
  parseDepartures,
  parseLineReports,
  Prim,
} from '../src/server/prim.js';
const clone = () => structuredClone(initialConfig);
const withDirectory = async (fn: (directory: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test('inheritance remains dynamic and an override survives a default change', () => {
  const c = clone();
  const b0: Block = {
    id: 'b0',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 2,
    overrides: {},
  };
  const b1 = { ...b0, id: 'b1', overrides: { walkMinutes: 12 } };
  c.profiles[0].blocks = [b0, b1];
  c.defaults.walkMinutes = 5;
  assert.equal(settings(c, c.profiles[0].blocks[0]).walkMinutes, 5);
  assert.equal(settings(c, c.profiles[0].blocks[1]).walkMinutes, 12);
  delete c.profiles[0].blocks[1].overrides.walkMinutes;
  assert.equal(settings(c, c.profiles[0].blocks[1]).walkMinutes, 5);
});
test('night is paused in Paris and DST repeated hour is handled', () => {
  const s = initialConfig.defaults;
  assert.equal(active(s, new Date('2026-10-25T20:59:00Z')), true);
  assert.equal(active(s, new Date('2026-10-25T21:00:00Z')), false);
  assert.equal(active(s, new Date('2026-10-26T04:00:00Z')), true);
  assert.equal(refreshDelay(initialConfig, new Date('2026-10-25T21:00:00Z')), 7 * 3600);
  assert.equal(refreshDelay(initialConfig, new Date('2026-10-25T20:59:50Z')), 10);
  assert.equal(refreshDelay(initialConfig, new Date('2026-10-24T20:00:00Z')), 8 * 3600);
  assert.equal(active(s, new Date('2026-10-25T01:30:00Z')), false);
});
test('overnight schedule belongs to the day on which it starts', () => {
  const s = { start: '22:00', end: '05:00', days: [1] };
  assert.equal(active(s, new Date('2026-10-26T22:00:00Z')), true);
  assert.equal(active(s, new Date('2026-10-27T02:00:00Z')), true);
  assert.equal(active(s, new Date('2026-10-28T02:00:00Z')), false);
});
test('layout packs half-width blocks without overlap and warns about screen overflow', () => {
  const c = clone();
  const b0: Block = {
    id: 'b0',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 1,
    overrides: {},
  };
  const b1 = { ...b0, id: 'b1' };
  c.profiles[0].blocks = [b0, b1];
  assert.deepEqual(
    layout(c.profiles[0].blocks).cells.map((v) => [v.row, v.col]),
    [
      [0, 0],
      [0, 1],
    ],
  );
  const base = {
    id: 'x',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 2,
    overrides: {},
  };
  c.defaults.pollSeconds = 900;
  c.profiles[0].blocks = Array.from({ length: 5 }, (_, i) => ({
    ...base,
    id: String(i),
  })) as Block[];
  assert.doesNotThrow(() => validateConfig(c));
  assert.ok(minimalWarnings(c).length > 0);
});
test('estimated budget deduplicates a station and rejects excessive collection', () => {
  const c = clone();
  const base: Block = {
    id: 'x',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: 'STIF:Line::C01740:',
    directionRef: '',
    destinationRef: '',
    span: 2,
    overrides: {},
  };
  c.profiles[0].blocks = [
    { ...base, id: 'b0' },
    { ...base, id: 'b1' },
  ];
  const separate = estimatedCalls(c);
  c.profiles[0].blocks.forEach((b) => {
    b.monitoringRef = 'STIF:StopArea:SP:123:';
  });
  assert.ok(estimatedCalls(c) < separate);
  c.defaults.pollSeconds = 60;
  assert.throws(() => validateConfig(c), /900/);
});
test('estimates above 900 combined calls are accepted when each API stays within its quota', () => {
  const c = clone();
  const base: Block = {
    id: 'x',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 2,
    overrides: {},
  };
  c.defaults.pollSeconds = 300;
  c.profiles[0].blocks = Array.from({ length: 3 }, (_, i) => ({ ...base, id: String(i) }));
  assert.deepEqual(estimatedCallsByApi(c), { 'stop-monitoring': 651, 'line-reports': 219 });
  c.profiles[0].blocks.push({ ...base, id: '3' });
  assert.ok(estimatedCalls(c) > 900);
  assert.doesNotThrow(() => validateConfig(c));
  c.profiles[0].blocks.push({ ...base, id: '4' });
  assert.throws(() => validateConfig(c), /Prochains passages.*900/);
});
test('traffic estimates enforce their own automatic quota', () => {
  const c = clone();
  c.defaults.start = c.defaults.end = '00:00';
  const base: Block = {
    id: 'x',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: 'shared-stop',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 2,
    overrides: {},
  };
  c.profiles[0].blocks = Array.from({ length: 9 }, (_, i) => ({ ...base, id: String(i) }));
  assert.throws(() => validateConfig(c), /Messages info trafic.*900/);
});
test('exhausting one API leaves the other quota available, including after restart', async () =>
  withDirectory(async (dir) => {
    const store = new Store(dir);
    const now = Date.now();
    const budget = new Budget(store, {
      reservations: Array.from({ length: 1000 }, () => ({
        at: now,
        api: 'stop-monitoring',
        automatic: false,
      })),
    });
    await assert.rejects(() => budget.reserve('stop-monitoring', false, now), /Prochains passages/);
    await budget.reserve('line-reports', true, now);
    const reopened = new Budget(store, await store.read('budget.json', { reservations: [] }));
    assert.deepEqual(
      reopened.counts(now).apis.map((api) => api.used),
      [1000, 1],
    );
    assert.deepEqual(
      reopened.counts(now + 86400000).apis.map((api) => api.used),
      [0, 0],
    );
    await assert.rejects(() => reopened.reserve('unknown-api', false, now), /sans quota/);
  }));
test('reservations are serialized, persisted before use, and retained on restart', async () =>
  withDirectory(async (dir) => {
    const store = new Store(dir);
    const now = Date.now();
    const state = {
      reservations: Array.from({ length: 998 }, () => ({
        at: now,
        api: 'stop-monitoring',
        automatic: false,
      })),
    };
    const budget = new Budget(store, state);
    const result = await Promise.allSettled([
      budget.reserve('stop-monitoring', false, now),
      budget.reserve('stop-monitoring', false, now),
      budget.reserve('stop-monitoring', false, now),
    ]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 2);
    const reopened = new Budget(store, await store.read('budget.json', { reservations: [] }));
    assert.equal(reopened.counts(now).used, 1000);
    await assert.rejects(() => reopened.reserve('stop-monitoring', false, now));
    assert.equal(reopened.counts(now + 86400001).used, 0);
  }));
test('automatic calls leave a margin and corrupt counters fail closed', async () =>
  withDirectory(async (dir) => {
    const store = new Store(dir);
    const now = Date.now();
    const budget = new Budget(store, {
      reservations: Array.from({ length: 900 }, () => ({
        at: now,
        api: 'stop-monitoring',
        automatic: true,
      })),
    });
    await assert.rejects(() => budget.reserve('stop-monitoring', true, now));
    await budget.reserve('stop-monitoring', false, now);
    await budget.reserve('line-reports', true, now);
    assert.deepEqual(
      budget.counts(now).apis.map((api) => api.used),
      [901, 1],
    );
    await writeFile(join(dir, 'budget.json'), 'broken');
    await assert.rejects(() => store.read('budget.json', { reservations: [] }));
  }));
const stopPayload = (destination = 'Paris Saint-Lazare', direction = 'outbound') => ({
  Siri: {
    ServiceDelivery: {
      StopMonitoringDelivery: [
        {
          Status: true,
          MonitoredStopVisit: [
            {
              MonitoredVehicleJourney: {
                LineRef: { value: 'STIF:Line::C01740:' },
                DirectionRef: { value: direction },
                DestinationName: [{ value: destination }],
                DestinationRef: { value: 'dest-paris' },
                FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'train-1' },
                MonitoredCall: {
                  ExpectedDepartureTime: '2026-10-26T08:12:00Z',
                  AimedDepartureTime: '2026-10-26T08:10:00Z',
                  DepartureStatus: 'cancelled',
                  DeparturePlatformName: { value: 'B' },
                },
              },
            },
          ],
        },
      ],
    },
  },
});
test('SIRI parser handles references, cancellation, estimates and missing structures', () => {
  const data = parseDepartures(stopPayload());
  assert.equal(data[0].destination, 'Paris Saint-Lazare');
  assert.equal(data[0].cancelled, true);
  assert.equal(data[0].realtime, true);
  assert.equal(data[0].platform, 'B');
  assert.equal(data[0].directionRef, 'outbound');
  assert.throws(() => parseDepartures({}));
  assert.throws(() =>
    parseDepartures({ Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ Status: false }] } } }),
  );
});
test('line_reports parser keeps current disruptions, web text, title and Paris validity', () => {
  // Shapes taken from real IDFM responses (November 2026).
  const messages = [
    {
      text: 'Ligne L : Paris <> Nanterre',
      channel: { id: 't', name: 'titre', content_type: 'text/plain', types: ['title'] },
    },
    {
      text: '<p>Texte <b>complet</b><br>Suite&nbsp;l&#39;axe.</p><p>Particularit&#233;</p>',
      channel: { id: 'w', name: 'moteur', content_type: 'text/html', types: ['web'] },
    },
  ];
  const line = [{ pt_object: { embedded_type: 'line', id: 'line:IDFM:C01740' } }];
  const input = {
    disruptions: [
      {
        id: 'd1',
        status: 'active',
        tags: [],
        application_periods: [{ begin: '20261117T050000', end: '20261117T230000' }],
        messages,
        impacted_objects: line,
      },
      // Same notice split by IDFM into another disruption with other periods.
      {
        id: 'd2',
        status: 'active',
        application_periods: [{ begin: '20261118T050000', end: '20261118T230000' }],
        messages,
        impacted_objects: line,
      },
      {
        id: 'lift',
        status: 'active',
        tags: ['Ascenseur'],
        messages: [{ text: 'Ascenseur indisponible', channel: { types: ['web'] } }],
        impacted_objects: [{ pt_object: { embedded_type: 'stop_area', id: 'stop_area:IDFM:1' } }],
      },
      { id: 'old', status: 'past', messages: [{ text: 'Fini', channel: { types: ['web'] } }] },
      { id: 'empty', status: 'active', messages: [] },
    ],
    line_reports: [],
  };
  const now = Date.parse('2026-11-18T10:00:00Z');
  const incidents = parseLineReports(input, 'STIF:Line::C01741:', now);
  assert.equal(incidents.length, 1);
  const [i] = incidents;
  assert.equal(i.id, 'd1');
  assert.equal(i.title, 'Paris – Nanterre');
  assert.equal(i.text, 'Texte complet\nSuite l’axe.\n\nParticularité');
  assert.deepEqual(i.lineRefs, ['STIF:Line::C01740:']);
  // Winter time: 05:00 in Paris is 04:00 UTC; the period covering `now` is chosen.
  assert.equal(i.starts, '2026-11-18T04:00:00.000Z');
  assert.equal(i.ends, '2026-11-18T22:00:00.000Z');
  assert.equal(navitiaDate('20260701T120000'), '2026-07-01T10:00:00.000Z');
  assert.deepEqual(parseLineReports({ line_reports: [] }, 'STIF:Line::C01740:'), []);
  assert.throws(() => parseLineReports({ error: { message: 'unknown object' } }, 'x'), /unknown/);
  assert.throws(() => parseLineReports({}, 'x'), /disruptions/);
  assert.equal(
    lineReportsPath('STIF:Line::C01740:'),
    'v2/navitia/line_reports/lines/line:IDFM:C01740/line_reports',
  );
});
test('line_reports parser attaches each disruption to the lines it actually impacts', () => {
  const notice = (body: string) => [{ text: body, channel: { types: ['web'] } }];
  const input = {
    disruptions: [
      // Section of another line through a shared station.
      {
        id: 'section',
        status: 'active',
        messages: notice('Travaux sur la ligne voisine'),
        impacted_objects: [
          {
            pt_object: {
              embedded_type: 'line_section',
              id: 'ls1',
              line_section: { line: { id: 'line:IDFM:C01742' } },
            },
          },
        ],
      },
      // Station disruption with no identifiable line, not linked to the queried line.
      {
        id: 'elsewhere',
        status: 'active',
        messages: notice('Gare fermée ailleurs'),
        impacted_objects: [{ pt_object: { embedded_type: 'stop_area', id: 'stop_area:IDFM:9' } }],
      },
      // Station disruption linked by the queried line's report: kept on that line.
      {
        id: 'closure',
        status: 'active',
        messages: notice('Gare fermée'),
        impacted_objects: [{ pt_object: { embedded_type: 'stop_area', id: 'stop_area:IDFM:1' } }],
      },
      // Route of another line, via its impacted section.
      {
        id: 'route',
        status: 'active',
        messages: notice('Arrêt non desservi'),
        impacted_objects: [
          {
            pt_object: { embedded_type: 'stop_point', id: 'stop_point:IDFM:3' },
            impacted_section: { routes: [{ id: 'r', line: { id: 'line:IDFM:C01743' } }] },
          },
        ],
      },
      // One notice split over two lines: merged, union of the lines.
      {
        id: 'm1',
        status: 'active',
        messages: notice('Grève'),
        impacted_objects: [{ pt_object: { embedded_type: 'line', id: 'line:IDFM:C01740' } }],
      },
      {
        id: 'm2',
        status: 'active',
        messages: notice('Grève'),
        impacted_objects: [
          {
            pt_object: {
              embedded_type: 'route',
              id: 'route:1',
              route: { line: { id: 'line:IDFM:C01741' } },
            },
          },
        ],
      },
    ],
    line_reports: [
      {
        line: { id: 'line:IDFM:C01740', links: [{ type: 'disruption', id: 'm1' }] },
        pt_objects: [
          {
            id: 'stop_area:IDFM:1',
            embedded_type: 'stop_area',
            links: [{ type: 'disruption', id: 'closure', rel: 'disruptions' }],
          },
        ],
      },
      {
        line: { id: 'line:IDFM:C01742', links: [{ type: 'disruption', id: 'elsewhere' }] },
        pt_objects: [],
      },
    ],
  };
  const byId = Object.fromEntries(
    parseLineReports(input, 'STIF:Line::C01740:').map((i) => [i.id, i.lineRefs]),
  );
  assert.deepEqual(byId, {
    section: ['STIF:Line::C01742:'],
    closure: ['STIF:Line::C01740:'],
    route: ['STIF:Line::C01743:'],
    m1: ['STIF:Line::C01740:', 'STIF:Line::C01741:'],
  });
});
test('real line_reports response (line L, reduced): lifts dropped, notices kept on line L only', async () => {
  const payload = JSON.parse(
    await readFile(new URL('./fixtures/line-reports-C01740.json', import.meta.url), 'utf8'),
  );
  const now = Date.parse('2026-11-24T22:00:00Z');
  for (const queried of ['STIF:Line::C01740:', 'STIF:Line::C01741:']) {
    const incidents = parseLineReports(payload, queried, now);
    assert.deepEqual(
      incidents.map((i) => [i.id.slice(0, 8), i.lineRefs]),
      [
        ['7537023c', ['STIF:Line::C01740:']],
        ['e2a63b7b', ['STIF:Line::C01740:']],
      ],
    );
  }
});
test('no-key demo never calls upstream; configuration persists and pause removes times', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), '');
    await service.init();
    assert.equal(service.mode, 'demo');
    service.prim.request = async () => {
      throw new Error('Unexpected upstream access');
    };
    await service.tick();
    const c = clone();
    const base: Block = {
      id: 'demo-1',
      station: 'La Défense',
      line: 'L',
      direction: 'Paris Saint-Lazare',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 2,
      overrides: {},
    };
    c.profiles[0].blocks = [base];
    await service.save(c);
    const view = service.dashboard(new Date('2026-10-26T10:00:00Z'));
    assert.equal(view.blocks.length, 1);
    assert.equal(view.blocks[0].departures.length, 8);
    assert.equal(service.budget.counts().used, 0);
    assert.equal(
      service.dashboard(new Date('2026-10-26T22:00:00Z')).blocks[0].departures.length,
      0,
    );
    const c2 = clone();
    c2.profiles[0].blocks = [base];
    c2.defaults.walkMinutes = 11;
    await service.save(c2);
    const restarted = new Service(new Store(dir), '');
    await restarted.init();
    assert.equal(restarted.config.defaults.walkMinutes, 14);
  }));
test('demo incidents follow the line of each block, not its position', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), '');
    await service.init();
    const block = (id: string, line: string, lineRef: string): Block => ({
      id,
      station: 'La Défense',
      line,
      direction: 'D',
      monitoringRef: '',
      lineRef,
      directionRef: '',
      destinationRef: '',
      span: 1,
      overrides: {},
    });
    const c = clone();
    c.profiles[0].blocks = [
      block('a', 'A', 'STIF:Line::C01742:'),
      block('u', 'U', 'STIF:Line::C01741:'),
      block('l', 'L', 'STIF:Line::C01740:'),
    ];
    await service.save(c);
    const views = service.dashboard(new Date('2026-10-26T10:00:00Z')).blocks;
    assert.deepEqual(
      views.map((v) => [v.block.id, v.incidents.map((i) => i.id), v.incidents[0]?.lineRefs]),
      [
        ['a', [], undefined],
        ['u', ['demo-incident-u'], ['STIF:Line::C01741:']],
        ['l', ['demo-incident'], ['STIF:Line::C01740:']],
      ],
    );
  }));
test('live snapshot filters by line and direction, rejects past departures and stale data', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    const c = clone();
    c.defaults.pollSeconds = 180;
    const base: Block = {
      id: 'b0',
      station: 'A',
      line: 'L',
      direction: 'D',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 2,
      overrides: {},
    };
    base.monitoringRef = 'STIF:StopArea:SP:123:';
    base.lineRef = 'STIF:Line::C01740:';
    base.directionRef = 'outbound';
    c.profiles[0].blocks = [base];
    await service.save(c);
    const now = new Date('2026-10-26T08:00:00Z');
    const train = parseDepartures(stopPayload())[0];
    service.cache.stops[base.monitoringRef] = {
      at: now.getTime(),
      next: now.getTime() + 180000,
      data: [
        train,
        { ...train, id: 'other', directionRef: 'inbound' },
        { ...train, id: 'past', time: '2026-10-26T07:00:00Z' },
      ],
    };
    assert.equal(service.dashboard(now).blocks[0].departures.length, 1);
    assert.equal(
      service.dashboard(new Date(now.getTime() + 600000)).blocks[0].departures.length,
      0,
    );
  }));
test('PRIM errors still reserve budget and API key stays in headers', async () =>
  withDirectory(async (dir) => {
    const store = new Store(dir);
    const budget = new Budget(store, { reservations: [] });
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).startsWith('https://prim.iledefrance-mobilites.fr/'));
      assert.equal((init?.headers as Record<string, string> | undefined)?.apiKey, 'secret');
      assert.ok(!String(input).includes('secret'));
      return new Response('{}', { status: 429 });
    };
    try {
      const prim = new Prim('secret', budget);
      await assert.rejects(() => prim.request('stop-monitoring', {}), /429/);
      assert.equal(budget.counts().used, 1);
      await assert.rejects(() => prim.request('stop-monitoring', {}), /attente/);
      assert.equal(budget.counts().used, 1);
      await assert.rejects(() => prim.request('line-reports', {}), /429/);
      assert.deepEqual(
        budget.counts().apis.map((api) => api.used),
        [1, 1],
      );
    } finally {
      globalThis.fetch = original;
    }
  }));

test('minimal capacity warns about short rows and long text without blocking or shrinking', () => {
  const c = clone();
  c.defaults.pollSeconds = 600;
  c.screen = { ...c.screen, width: 800, height: 688 };
  c.profiles[0].grid.rows = 4;
  const base: Block = {
    id: 'x',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 2,
    overrides: {},
  };
  c.profiles[0].blocks = Array.from({ length: 4 }, (_, i) => ({ ...base, id: String(i) }));
  assert.doesNotThrow(() => validateConfig(c));
  assert.match(minimalWarnings(c).join(' '), /ne tient pas/);
  c.screen.height = 840;
  assert.doesNotThrow(() => validateConfig(c));
  assert.deepEqual(minimalWarnings(c), []);
  c.screen.height = 839;
  assert.doesNotThrow(() => validateConfig(c));
  assert.match(minimalWarnings(c).join(' '), /ne tient pas/);
  c.profiles[0].blocks = c.profiles[0].blocks.map((b) => ({ ...b, span: 1 as const }));
  c.screen.height = 600;
  c.profiles[0].grid.rows = 2;
  assert.doesNotThrow(() => validateConfig(c));
  c.profiles[0].blocks[0].direction = 'W'.repeat(60);
  assert.doesNotThrow(() => validateConfig(c));
  assert.match(minimalWarnings(c).join(' '), /ne tient pas/);
});

test('queued requests check active window immediately before reserving credit', async () =>
  withDirectory(async (dir) => {
    const store = new Store(dir);
    const budget = new Budget(store, { reservations: [] });
    const prim = new Prim('test-key', budget, () => false);
    await assert.rejects(() => prim.request('stop-monitoring', {}), /suspendus/);
    assert.equal(budget.counts().used, 0);
  }));

test('collector deduplicates stop requests across blocks and respects next collection', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    const c = clone();
    c.defaults.start = '00:00';
    c.defaults.end = '00:00';
    c.defaults.pollSeconds = 300;
    const base: Block = {
      id: 'x',
      station: 'A',
      line: 'L',
      direction: 'D',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 2,
      overrides: {},
    };
    c.profiles[0].blocks = [
      {
        ...base,
        id: 'b0',
        monitoringRef: 'STIF:StopArea:SP:123:',
        lineRef: 'STIF:Line::C01740:',
        directionRef: 'outbound',
      },
      {
        ...base,
        id: 'b1',
        monitoringRef: 'STIF:StopArea:SP:123:',
        lineRef: 'STIF:Line::C01741:',
        directionRef: 'outbound',
      },
    ];
    await service.save(c);
    const calls: string[] = [];
    service.prim.request = async (path) => {
      calls.push(path);
      return path === 'stop-monitoring' ? stopPayload() : { disruptions: [], line_reports: [] };
    };
    await service.tick();
    assert.equal(calls.filter((c) => c === 'stop-monitoring').length, 1);
    assert.equal(calls.filter((c) => c === 'line-reports').length, 2);
    await service.tick();
    service.dashboard();
    service.dashboard();
    assert.equal(calls.length, 3);
    service.config.defaults.days = [];
    await service.tick();
    assert.equal(calls.length, 3);
  }));

test('PRIM requests match the supplied departures and traffic Swagger contracts', async () =>
  withDirectory(async (dir) => {
    type Swagger = {
      host: string;
      basePath: string;
      paths: Record<
        string,
        { get: { parameters: { name: string; in: string; required?: boolean }[] } }
      >;
      securityDefinitions: Record<string, { in: string; name: string }>;
    };
    const contracts = await Promise.all(
      ['departures', 'line-reports'].map(
        async (name) =>
          JSON.parse(
            await readFile(new URL(`../docs/api/${name}.swagger.json`, import.meta.url), 'utf8'),
          ) as Swagger,
      ),
    );
    const original = globalThis.fetch;
    let index = 0;
    globalThis.fetch = async (input, init) => {
      const contract = contracts[index++];
      const url = new URL(String(input));
      assert.equal(url.hostname, contract.host);
      assert.ok(url.pathname.startsWith(contract.basePath));
      const path = url.pathname.slice(contract.basePath.length);
      const template = Object.keys(contract.paths).find((t) =>
        new RegExp(`^${t.replace(/\{[^}]+\}/g, '.+')}$`).test(path),
      );
      const operation = template && contract.paths[template].get;
      assert.ok(operation, `GET ${path} must be documented`);
      const query = operation.parameters.filter((p) => p.in === 'query');
      for (const key of url.searchParams.keys())
        assert.ok(
          query.some((p) => p.name === key),
          key,
        );
      for (const parameter of query.filter((p) => p.required))
        assert.ok(url.searchParams.has(parameter.name), parameter.name);
      const security = Object.values(contract.securityDefinitions).find((s) => s.in === 'header')!;
      assert.equal(new Headers(init?.headers).get(security.name), 'test-key');
      assert.equal(new Headers(init?.headers).get('Accept-Encoding'), 'gzip, deflate');
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const store = new Store(dir);
      const prim = new Prim('test-key', new Budget(store, { reservations: [] }));
      await prim.request('stop-monitoring', { MonitoringRef: 'STIF:StopArea:SP:123:' });
      await prim.request(
        'line-reports',
        { disable_geojson: 'true' },
        true,
        lineReportsPath('STIF:Line::C01740:'),
      );
      assert.equal(index, 2);
    } finally {
      globalThis.fetch = original;
    }
  }));

test('local catalog maps SNCF stop areas and rail lines without confusing replacement buses', async () => {
  const { loadCatalog } = await import('../src/server/catalog.js');
  const catalog = await loadCatalog();
  const matches = catalog.search('la defense');
  const station = matches.find((stop) => stop.label === 'La Défense' && stop.mode === 'LocalTrain');
  assert.ok(station);
  assert.equal(station.monitoringRef, 'STIF:StopArea:SP:470549:');
  assert.deepEqual(station.lines?.map((line) => [line.label, line.ref]).sort(), [
    ['A', 'STIF:Line::C01742:'],
    ['E', 'STIF:Line::C01729:'],
    ['L', 'STIF:Line::C01740:'],
    ['U', 'STIF:Line::C01741:'],
  ]);
  assert.ok(
    station.lines?.every((line) => line.mode === 'LocalTrain' || line.mode === 'RapidTransit'),
  );
  assert.equal(catalog.search('STIF:StopArea:SP:470549:')[0].label, 'La Défense');
});
test('local catalog handles accents, stop points and duplicate associations', async () => {
  const { loadCatalog } = await import('../src/server/catalog.js');
  const catalog = await loadCatalog();
  const station = catalog.search('berault').find((stop) => stop.label === 'Bérault');
  assert.ok(station);
  assert.match(station.monitoringRef, /^STIF:StopPoint:Q:/);
  for (const stop of catalog.search('la defense'))
    assert.equal(new Set(stop.lineRefs).size, stop.lineRefs?.length);
  assert.equal(catalog.search('').length, 0);
  assert.ok(catalog.search('saint').length <= 20);
});
test('reference lookup works offline outside service hours and consumes no PRIM credit', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    service.config.defaults.days = [];
    service.prim.request = async () => {
      throw new Error('Unexpected upstream call');
    };
    const station = (await service.search('la defense')).find(
      (stop) => stop.label === 'La Défense' && stop.mode === 'LocalTrain',
    );
    assert.ok(station);
    assert.equal(service.catalog.lines(station.monitoringRef).length, 4);
    assert.equal(service.budget.counts().used, 0);
  }));
test('demonstration direction IDs cannot silently become live collection filters', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    const c = clone();
    c.defaults.start = '00:00';
    c.defaults.end = '00:00';
    const base: Block = {
      id: 'x',
      station: 'A',
      line: 'L',
      direction: 'D',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 2,
      overrides: {},
    };
    c.profiles[0].blocks = [
      {
        ...base,
        id: 'b0',
        monitoringRef: 'STIF:StopArea:SP:470549:',
        lineRef: 'STIF:Line::C01740:',
        directionRef: 'DEMO:direction:outbound',
      },
      {
        ...base,
        id: 'b1',
        monitoringRef: 'STIF:StopArea:SP:470549:',
        lineRef: 'STIF:Line::C01741:',
        directionRef: 'DEMO:direction:outbound',
      },
    ];
    await service.save(c);
    service.prim.request = async () => {
      throw new Error('Unexpected upstream call');
    };
    await service.tick();
    assert.ok(service.dashboard().blocks.every((block) => block.status === 'unconfigured'));
    assert.equal(service.budget.counts().used, 0);
  }));

test('configurable grid packs mixed spans and wraps without backfilling gaps', () => {
  const base: Block = {
    id: 'x',
    station: 'A',
    line: 'L',
    direction: 'D',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 1,
    overrides: {},
  };
  const blocks = [2, 1, 2, 3, 1].map((span, i) => ({ ...base, span, id: String(i) }));
  assert.deepEqual(layout(blocks, 4), {
    cells: [
      { id: '0', row: 0, col: 0, span: 2 },
      { id: '1', row: 0, col: 2, span: 1 },
      { id: '2', row: 1, col: 0, span: 2 },
      { id: '3', row: 2, col: 0, span: 3 },
      { id: '4', row: 2, col: 3, span: 1 },
    ],
    rows: 3,
  });
  const c = clone();
  c.defaults.pollSeconds = 600;
  c.screen = { ...c.screen, width: 2400, height: 900 };
  c.profiles[0].grid = { columns: 4, rows: 3 };
  c.defaults.pollSeconds = 900;
  c.profiles[0].blocks = blocks;
  assert.doesNotThrow(() => validateConfig(c));
  c.profiles[0].grid.rows = 2;
  assert.doesNotThrow(() => validateConfig(c));
  assert.match(minimalWarnings(c).join(' '), /nécessite 3 lignes/);
  c.profiles[0].grid.columns = 2;
  assert.doesNotThrow(() => validateConfig(c));
  assert.match(minimalWarnings(c).join(' '), /occupe 3 colonnes/);
});

test('grid respects empty rows, validates dimensions, and migrates legacy layouts', () => {
  const c = clone();
  c.profiles[0].blocks = [
    {
      id: 'x',
      station: 'A',
      line: 'L',
      direction: 'D',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 2,
      overrides: {},
    },
  ];
  c.profiles[0].grid.rows = 3;
  assert.doesNotThrow(() => validateConfig(c));
  assert.match(minimalWarnings(c).join(' '), /ne tient pas/);
  for (const key of ['columns', 'rows'] as const) {
    for (const value of [0, 13, 1.5]) {
      const invalid = clone();
      invalid.profiles[0].grid[key] = value;
      assert.throws(() => validateConfig(invalid));
    }
  }
  // A v1 configuration without grid gets the default columns and the rows its blocks need.
  const legacy = {
    version: 1,
    defaults: c.defaults,
    screen: c.screen,
    blocks: c.profiles[0].blocks,
  };
  const migrated = validateConfig(legacy);
  assert.equal(migrated.profiles[0].grid.columns, 2);
  assert.equal(migrated.profiles[0].grid.rows, 1);
  assert.deepEqual(migrated.profiles[0].blocks, c.profiles[0].blocks);
  c.profiles[0].grid = { columns: 1, rows: 1 };
  c.profiles[0].blocks[0].span = 1;
  assert.doesNotThrow(() => validateConfig(c));
});

test('overflowing layouts persist and oversized first blocks start at the top', async () =>
  withDirectory(async (dir) => {
    const service = new Service(new Store(dir), 'test-key');
    await service.init();
    const c = clone();
    c.screen = { ...c.screen, height: 240 };
    c.profiles[0].grid = { columns: 1, rows: 1 };
    c.profiles[0].blocks = [0, 1].map((id) => ({
      id: String(id),
      station: 'A',
      line: 'L',
      direction: 'D',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 2,
      overrides: {},
    }));
    assert.ok(minimalWarnings(c).length > 0);
    await service.save(c);
    assert.deepEqual(await new Store(dir).read('config.json', null), c);
    assert.deepEqual(
      layout(c.profiles[0].blocks, 1).cells.map(({ row, col }) => [row, col]),
      [
        [0, 0],
        [1, 0],
      ],
    );
  }));
