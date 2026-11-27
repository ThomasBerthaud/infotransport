import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatParis,
  fromParisWallClock,
  localParts,
  parisDate,
  parisDay,
  parisOffset,
} from '../src/shared/paris-time.js';

const HOUR_MS = 3_600_000;
const at = (iso: string) => Date.parse(iso);
const iso = (t: number) => new Date(t).toISOString();

// Daylight saving starts on 29 March 2026 at 01:00 UTC and ends on 25 October 2026 at 01:00 UTC.
test('Paris offset is one hour in winter, two in summer, and switches at the exact instant', () => {
  assert.equal(parisOffset(at('2026-11-20T10:00:00Z')), HOUR_MS);
  assert.equal(parisOffset(at('2026-07-20T10:00:00Z')), 2 * HOUR_MS);
  assert.equal(parisOffset(at('2026-03-29T00:59:59Z')), HOUR_MS);
  assert.equal(parisOffset(at('2026-03-29T01:00:00Z')), 2 * HOUR_MS);
  assert.equal(parisOffset(at('2026-10-25T00:59:59Z')), 2 * HOUR_MS);
  assert.equal(parisOffset(at('2026-10-25T01:00:00Z')), HOUR_MS);
});

test('Paris wall-clock times map to instants, around daylight saving changes too', () => {
  assert.equal(iso(fromParisWallClock(Date.UTC(2026, 10, 18, 6))), '2026-11-18T05:00:00.000Z');
  assert.equal(iso(fromParisWallClock(Date.UTC(2026, 6, 1, 12))), '2026-07-01T10:00:00.000Z');
  // 29 March: 01:30 is still winter time, 03:30 already summer time.
  assert.equal(iso(fromParisWallClock(Date.UTC(2026, 2, 29, 1, 30))), '2026-03-29T00:30:00.000Z');
  assert.equal(iso(fromParisWallClock(Date.UTC(2026, 2, 29, 3, 30))), '2026-03-29T01:30:00.000Z');
  // 25 October: 01:30 is still summer time, 04:00 winter time again.
  assert.equal(iso(fromParisWallClock(Date.UTC(2026, 9, 25, 1, 30))), '2026-10-24T23:30:00.000Z');
  assert.equal(iso(fromParisWallClock(Date.UTC(2026, 9, 25, 4))), '2026-10-25T03:00:00.000Z');
});

test('Paris calendar date changes at Paris midnight, not UTC midnight', () => {
  assert.equal(parisDate(at('2026-11-20T22:59:59Z')), '20261120');
  assert.equal(parisDate(at('2026-11-20T23:00:00Z')), '20261121');
  assert.equal(parisDate(at('2026-07-20T21:59:59Z')), '20260720');
  assert.equal(parisDate(at('2026-07-20T22:00:00Z')), '20260721');
  assert.equal(parisDay(at('2026-07-20T22:00:00Z')), Date.UTC(2026, 6, 21));
  // Days across a daylight saving change stay whole days apart.
  assert.equal(
    parisDay(at('2026-10-25T22:00:00Z')) - parisDay(at('2026-10-24T21:00:00Z')),
    86_400_000,
  );
});

test('Paris weekday and minute of the day', () => {
  assert.deepEqual(localParts(new Date('2026-11-22T22:59:00Z')), { day: 7, minute: 23 * 60 + 59 });
  assert.deepEqual(localParts(new Date('2026-11-22T23:00:00Z')), { day: 1, minute: 0 });
  assert.deepEqual(localParts(new Date('2026-07-20T06:30:00Z')), { day: 1, minute: 8 * 60 + 30 });
  assert.deepEqual(localParts(new Date('2026-10-25T01:30:00Z')), { day: 7, minute: 2 * 60 + 30 });
});

test('Paris formatting ignores the device time zone', () => {
  const time = { hour: '2-digit', minute: '2-digit' } as const;
  assert.equal(formatParis('2026-11-18T22:00:00Z', time), '23:00');
  assert.equal(formatParis(at('2026-07-01T10:00:00Z'), time), '12:00');
  assert.equal(
    formatParis(new Date('2026-11-18T23:30:00Z'), { day: '2-digit', month: '2-digit' }),
    '19/11',
  );
  assert.equal(formatParis('2026-11-18T22:00:00Z', { dateStyle: 'long' }), '18 novembre 2026');
});
