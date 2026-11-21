import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialConfig, type Block, type Dashboard, type Departure } from '../src/shared/model.js';
import {
  offlineDashboard,
  timetablesDue,
  timetablesSignature,
  type Snapshot,
  type StoredTimetables,
} from '../src/shared/offline.js';

// 11:00 in Paris, inside the default 05:00–22:00 window.
const NOW = new Date('2026-11-20T10:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60000).toISOString();

const block: Block = {
  id: 'b0',
  station: 'La Défense',
  line: 'L',
  direction: 'Paris Saint-Lazare',
  monitoringRef: 'STIF:StopArea:SP:71517:',
  lineRef: 'STIF:Line::C01740:',
  directionRef: '',
  destinationRef: 'STIF:StopPoint:Q:41210:',
  span: 2,
  overrides: { richCount: 4 },
};
const departure = (minutes: number, patch: Partial<Departure> = {}): Departure => ({
  id: `d${minutes}`,
  time: at(minutes),
  aimedTime: at(minutes),
  destination: 'Paris Saint-Lazare',
  lineRef: block.lineRef,
  cancelled: false,
  realtime: true,
  ...patch,
});

function snapshot(departures: Departure[], savedMinutesAgo = 10, config = initialConfig): Snapshot {
  const dashboard: Dashboard = {
    mode: 'live',
    now: at(-savedMinutesAgo),
    paused: false,
    refreshSeconds: 60,
    config: { ...config, profiles: [{ ...config.profiles[0], blocks: [block] }] },
    timetables: '2026-11-19T08:00:00.000Z',
    blocks: [
      {
        profileId: config.profiles[0].id,
        block,
        effective: { ...config.defaults, ...block.overrides },
        departures,
        incidents: [
          { id: 'i1', title: 'Travaux', text: '', lineRefs: [block.lineRef] },
          { id: 'i2', title: 'Fini', text: '', lineRefs: [block.lineRef], ends: at(-1) },
        ],
        status: departures.length ? 'ok' : 'empty',
        trafficKnown: true,
      },
    ],
  };
  return { savedAt: dashboard.now, dashboard };
}
function timetables(saved: Snapshot, minutes: number[], patch: Partial<StoredTimetables> = {}) {
  return {
    importedAt: '2026-11-19T08:00:00.000Z',
    validUntil: at(24 * 60),
    until: at(48 * 60),
    blocks: { b0: minutes.map((m) => ({ time: at(m), destination: 'Gare Saint-Lazare' })) },
    fetchedAt: at(-60),
    signature: timetablesSignature(saved.dashboard),
    ...patch,
  } satisfies StoredTimetables;
}

test('nothing saved means no offline dashboard', () => {
  assert.equal(offlineDashboard(undefined, undefined, NOW), undefined);
});

test('a snapshot saved before profiles is migrated and keeps its timetables', () => {
  const saved = snapshot([departure(5)]);
  const { defaultProfileId: _d, profiles, ...rest } = saved.dashboard.config;
  const legacy = {
    savedAt: saved.savedAt,
    dashboard: {
      ...saved.dashboard,
      config: {
        ...rest,
        version: 1,
        screen: { ...rest.screen, columns: 2, rows: 1 },
        blocks: profiles[0].blocks,
      },
      blocks: saved.dashboard.blocks.map(({ profileId: _p, ...view }) => view),
    },
  } as unknown as Snapshot;
  const stored = timetables(saved, [30]);
  const view = offlineDashboard(legacy, stored, NOW)!;
  assert.equal(view.config.version, 2);
  assert.deepEqual(
    view.blocks.map((b) => b.profileId),
    ['principal'],
  );
  assert.deepEqual(
    view.blocks[0].departures.map((d) => d.source),
    ['snapshot', 'scheduled'],
  );
});

test('saved departures are marked, and drop once left beyond the 30 s grace', () => {
  const view = offlineDashboard(
    snapshot([departure(-1), departure(-0.25), departure(5), departure(9, { cancelled: true })]),
    undefined,
    NOW,
  )!;
  assert.deepEqual(view.offline, { savedAt: at(-10), expired: false, scheduled: false });
  assert.equal(view.now, NOW.toISOString());
  const [b] = view.blocks;
  assert.deepEqual(
    b.departures.map((d) => [d.id, d.source, d.cancelled]),
    [
      ['d-0.25', 'snapshot', false],
      ['d5', 'snapshot', false],
      ['d9', 'snapshot', true],
    ],
  );
  assert.equal(b.status, 'ok');
  // Incidents known when saved stay, unless they ended since.
  assert.deepEqual(
    b.incidents.map((i) => i.id),
    ['i1'],
  );
  assert.equal(b.trafficKnown, true);
});

test('a block whose saved departures all left is empty', () => {
  const view = offlineDashboard(snapshot([departure(-5)]), undefined, NOW)!;
  assert.equal(view.blocks[0].status, 'empty');
  assert.deepEqual(view.blocks[0].departures, []);
});

test('saved data older than two hours is ignored, timetables still apply', () => {
  const saved = snapshot([departure(5)], 121);
  const view = offlineDashboard(saved, undefined, NOW)!;
  assert.equal(view.offline?.expired, true);
  assert.deepEqual(view.blocks[0].departures, []);
  assert.deepEqual(view.blocks[0].incidents, []);
  assert.equal(view.blocks[0].trafficKnown, false);
  const planned = offlineDashboard(saved, timetables(saved, [3, 7]), NOW)!;
  assert.deepEqual(
    planned.blocks[0].departures.map((d) => [d.time, d.source, d.realtime]),
    [
      [at(3), 'scheduled', false],
      [at(7), 'scheduled', false],
    ],
  );
  assert.equal(planned.offline?.scheduled, true);
});

test('scheduled departures complete saved ones after their horizon, without duplicates', () => {
  // The 6-minute departure runs 1 minute late: its planned minute is 5.
  const saved = snapshot([departure(2), departure(6, { aimedTime: at(5) })]);
  const view = offlineDashboard(saved, timetables(saved, [-5, 2, 4, 5, 10, 15, 20]), NOW)!;
  assert.deepEqual(
    view.blocks[0].departures.map((d) => [d.time, d.source]),
    [
      [at(2), 'snapshot'],
      [at(6), 'snapshot'],
      [at(10), 'scheduled'],
      [at(15), 'scheduled'],
      // Past richCount (4), the window goes on until 3 departures are reachable on foot.
      [at(20), 'scheduled'],
    ],
  );
});

test('timetables are ignored after their validity or for another configuration', () => {
  const saved = snapshot([]);
  const expired = timetables(saved, [5], { validUntil: at(-1) });
  assert.deepEqual(offlineDashboard(saved, expired, NOW)!.blocks[0].departures, []);
  const other = timetables(saved, [5], { signature: 'other' });
  assert.deepEqual(offlineDashboard(saved, other, NOW)!.blocks[0].departures, []);
});

test('outside the active window blocks are paused without times', () => {
  const night = structuredClone(initialConfig);
  night.defaults.start = '22:00';
  night.defaults.end = '05:00';
  const saved = snapshot([departure(5)], 10, night);
  const view = offlineDashboard(saved, timetables(saved, [7]), NOW)!;
  assert.equal(view.paused, true);
  assert.equal(view.blocks[0].status, 'paused');
  assert.deepEqual(view.blocks[0].departures, []);
  assert.deepEqual(view.blocks[0].incidents, []);
});

test('timetables are downloaded once a day or when the import or blocks change', () => {
  const saved = snapshot([]);
  const stored = timetables(saved, []);
  assert.equal(timetablesDue(saved.dashboard, undefined, NOW), true);
  assert.equal(timetablesDue(saved.dashboard, stored, NOW), false);
  assert.equal(timetablesDue(saved.dashboard, { ...stored, fetchedAt: at(-24 * 60) }, NOW), true);
  const reimported = { ...saved.dashboard, timetables: '2026-11-20T08:00:00.000Z' };
  assert.equal(timetablesDue(reimported, stored, NOW), true);
  assert.equal(timetablesDue({ ...saved.dashboard, timetables: undefined }, stored, NOW), false);
});
