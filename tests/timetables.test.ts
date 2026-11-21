import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialConfig, type Block, type Config } from '../src/shared/model.js';
import {
  gtfsRouteId,
  gtfsStopId,
  importTimetables,
  serviceTime,
  splitCsv,
  Timetables,
  TIMETABLES_FILE,
} from '../src/server/timetables.js';

// Friday 20 November 2026, 11:00 in Paris.
const NOW = new Date('2026-11-20T10:00:00Z');

const block = (patch: Partial<Block>): Block => ({
  id: 'rer',
  station: 'La Défense',
  line: 'L',
  direction: 'Paris Saint-Lazare',
  monitoringRef: 'STIF:StopArea:SP:71517:',
  lineRef: 'STIF:Line::C01740:',
  directionRef: '',
  destinationRef: 'STIF:StopPoint:Q:41210:',
  span: 2,
  overrides: {},
  ...patch,
});
const config: Config = {
  ...initialConfig,
  profiles: [
    {
      ...initialConfig.profiles[0],
      blocks: [
        block({}),
        block({
          id: 'bus',
          station: 'Mairie',
          line: '144',
          direction: 'Mairie',
          monitoringRef: 'STIF:StopPoint:Q:100:',
          lineRef: 'STIF:Line::C02000:',
          directionRef: 'Aller',
          destinationRef: '',
        }),
        block({ id: 'todo', station: 'Nouveau', monitoringRef: '', lineRef: '' }),
      ],
    },
  ],
};
// Real-time departures already received for the bus direction teach its terminus.
const known = {
  'STIF:StopPoint:Q:100:': {
    data: [
      {
        id: 'x',
        time: NOW.toISOString(),
        destination: 'Mairie',
        destinationRef: 'STIF:StopPoint:Q:555:',
        directionRef: 'Aller',
        lineRef: 'STIF:Line::C02000:',
        cancelled: false,
        realtime: true,
      },
    ],
  },
};

const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
async function withGtfs(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-gtfs-'));
  try {
    await writeFile(
      join(dir, 'calendar.txt'),
      '﻿' +
        csv([
          [
            'service_id',
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
            'start_date',
            'end_date',
          ],
          ['IDFM:WK', '1', '1', '1', '1', '1', '0', '0', '20261101', '20261231'],
        ]),
    );
    await writeFile(
      join(dir, 'calendar_dates.txt'),
      csv([
        ['service_id', 'date', 'exception_type'],
        ['IDFM:WK', '20261123', '2'],
        ['IDFM:SAT', '20261121', '1'],
      ]),
    );
    await writeFile(
      join(dir, 'trips.txt'),
      csv([
        ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'trip_short_name', 'direction_id'],
        ['IDFM:C01740', 'IDFM:WK', 'T1', '"Paris Saint-Lazare"', 'PAZE', '1'],
        ['IDFM:C01740', 'IDFM:SAT', 'T2', 'Gare Saint-Lazare', '', '1'],
        ['IDFM:C01740', 'IDFM:WK', 'T3', 'La Verrière', '', '0'],
        ['IDFM:C01740', 'IDFM:WK', 'T4', 'La Défense', '', '0'],
        ['IDFM:C01740', 'IDFM:WK', 'T5', 'Paris Saint-Lazare', '', '1'],
        ['IDFM:C09999', 'IDFM:WK', 'T6', 'Paris Saint-Lazare', '', '1'],
        ['IDFM:C01740', 'IDFM:WK', 'T7', 'Paris Saint-Lazare', '', '1'],
        ['IDFM:C02000', 'IDFM:WK', 'B1', 'Mairie (quai A)', '', '1'],
        ['IDFM:C02000', 'IDFM:WK', 'B2', 'Gare', '', '0'],
      ]),
    );
    const stop = 'IDFM:monomodalStopPlace:71517';
    await writeFile(
      join(dir, 'stop_times.txt'),
      csv([
        [
          'trip_id',
          'arrival_time',
          'departure_time',
          'stop_id',
          'stop_sequence',
          'pickup_type',
          'drop_off_type',
        ],
        ['T1', '08:20:00', '08:20:00', 'IDFM:monomodalStopPlace:1', '0', '0', '0'],
        ['T1', '08:30:00', '08:30:00', stop, '1', '0', '0'],
        ['T1', '08:45:00', '08:45:00', 'IDFM:monomodalStopPlace:999', '2', '0', '0'],
        ['T2', '09:00:00', '09:00:00', stop, '0', '0', '0'],
        ['T2', '09:15:00', '09:15:00', 'IDFM:41210', '1', '0', '0'],
        ['T3', '10:00:00', '10:00:00', stop, '0', '0', '0'],
        ['T3', '10:30:00', '10:30:00', 'IDFM:monomodalStopPlace:3', '1', '0', '0'],
        ['T4', '10:00:00', '10:00:00', 'IDFM:monomodalStopPlace:1', '0', '0', '0'],
        ['T4', '10:20:00', '10:20:00', stop, '1', '0', '0'],
        ['T5', '11:00:00', '11:00:00', stop, '0', '1', '0'],
        ['T5', '11:30:00', '11:30:00', 'IDFM:monomodalStopPlace:999', '1', '0', '0'],
        ['T6', '12:00:00', '12:00:00', stop, '0', '0', '0'],
        ['T6', '12:30:00', '12:30:00', 'IDFM:monomodalStopPlace:999', '1', '0', '0'],
        ['T7', '25:10:00', '25:10:00', stop, '0', '0', '0'],
        ['T7', '25:40:00', '25:40:00', 'IDFM:monomodalStopPlace:999', '1', '0', '0'],
        ['B1', '13:00:00', '13:00:00', 'IDFM:100', '0', '0', '0'],
        ['B1', '13:20:00', '13:20:00', 'IDFM:555', '1', '0', '0'],
        ['B2', '14:00:00', '14:00:00', 'IDFM:100', '0', '0', '0'],
        ['B2', '14:20:00', '14:20:00', 'IDFM:777', '1', '0', '0'],
      ]),
    );
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('SIRI identifiers map to GTFS identifiers', () => {
  assert.equal(gtfsStopId('STIF:StopPoint:Q:41210:'), 'IDFM:41210');
  assert.equal(gtfsStopId('STIF:StopArea:SP:71517:'), 'IDFM:monomodalStopPlace:71517');
  assert.equal(gtfsStopId('DEMO:x'), undefined);
  assert.equal(gtfsRouteId('STIF:Line::C01740:'), 'IDFM:C01740');
  assert.equal(gtfsRouteId(''), undefined);
});

test('CSV fields may be quoted', () => {
  assert.deepEqual(splitCsv('a,"b, c","d ""e""",'), ['a', 'b, c', 'd "e"', '']);
});

test('GTFS times follow Paris time, daylight saving days and times past midnight', () => {
  assert.equal(
    new Date(serviceTime('20261120', '08:30:00')).toISOString(),
    '2026-11-20T07:30:00.000Z',
  );
  assert.equal(
    new Date(serviceTime('20260720', '08:30:00')).toISOString(),
    '2026-07-20T06:30:00.000Z',
  );
  // Daylight saving starts on 29 March 2026 and ends on 25 October 2026.
  assert.equal(
    new Date(serviceTime('20260329', '08:00:00')).toISOString(),
    '2026-03-29T06:00:00.000Z',
  );
  assert.equal(
    new Date(serviceTime('20261025', '08:00:00')).toISOString(),
    '2026-10-25T07:00:00.000Z',
  );
  assert.equal(
    new Date(serviceTime('20261120', '25:10:00')).toISOString(),
    '2026-11-21T00:10:00.000Z',
  );
});

test('import keeps the configured blocks, their direction and calendar', async () =>
  withGtfs(async (dir) => {
    const result = await importTimetables({ dir, config, known, now: NOW, source: 'test' });
    // 15 days from yesterday: the last service day is 3 December, valid until midnight.
    assert.equal(result.validUntil, '2026-12-03T23:00:00.000Z');
    assert.equal(result.importedAt, NOW.toISOString());
    const [rer, bus, todo] = result.entries;
    const paris = (iso: string) =>
      new Date(iso).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris',
        dateStyle: 'short',
        timeStyle: 'short',
      });
    const times = rer.departures.map((d) => paris(d.time));
    // Today 08:30 has left; T7 runs at 01:10 the next day; Saturday adds T2; Monday 23 is off.
    assert.deepEqual(times.slice(0, 4), [
      '21/11/2026 01:10',
      '21/11/2026 09:00',
      '24/11/2026 08:30',
      '25/11/2026 01:10',
    ]);
    assert.equal(times.filter((t) => t.startsWith('23/11')).length, 0);
    assert.equal(times.filter((t) => t.startsWith('24/11')).length, 1);
    // 8 weekdays for T1 and T7 each (T7 of 3 December is past the validity), plus T2.
    assert.equal(rer.departures.length, 17);
    assert.ok(rer.departures.every((d) => d.destination.includes('Saint-Lazare')));
    assert.ok(rer.departures.every((d) => Date.parse(d.time) < Date.parse(result.validUntil)));
    assert.deepEqual([...new Set(bus.departures.map((d) => d.destination))], ['Mairie (quai A)']);
    assert.equal(bus.departures.length, 9);
    assert.deepEqual(todo.departures, []);
    assert.deepEqual(result.uncovered, ['Nouveau · L → Paris Saint-Lazare']);
  }));

test('the server reloads a new import and reports its state', async () =>
  withGtfs(async (dir) => {
    const timetables = new Timetables(dir);
    await timetables.refresh();
    assert.equal(timetables.status(config, NOW).state, 'missing');
    assert.equal(timetables.forBrowser(config, NOW), undefined);
    const { uncovered: _, ...file } = await importTimetables({ dir, config, known, now: NOW });
    await writeFile(join(dir, TIMETABLES_FILE), JSON.stringify(file));
    await timetables.refresh();
    const status = timetables.status(config, NOW);
    assert.equal(status.state, 'ok');
    assert.deepEqual(status.uncovered, ['Nouveau · L → Paris Saint-Lazare']);
    assert.equal(timetables.version(NOW), NOW.toISOString());
    const browser = timetables.forBrowser(config, NOW)!;
    assert.equal(browser.until, '2026-11-22T10:00:00.000Z');
    assert.deepEqual(Object.keys(browser.blocks), ['rer', 'bus', 'todo']);
    assert.equal(browser.blocks.rer.length, 2);
    assert.ok(
      Object.values(browser.blocks)
        .flat()
        .every((d) => d.time < browser.until),
    );
    const later = new Date('2026-12-04T00:00:00Z');
    assert.equal(timetables.status(config, later).state, 'expired');
    assert.equal(timetables.version(later), undefined);
    // A corrupted file is reported, not served.
    await writeFile(join(dir, TIMETABLES_FILE), '{');
    const future = new Date(Date.now() + 5000);
    await utimes(join(dir, TIMETABLES_FILE), future, future);
    await timetables.refresh();
    assert.equal(timetables.status(config, NOW).state, 'invalid');
    assert.equal(timetables.forBrowser(config, NOW), undefined);
  }));
