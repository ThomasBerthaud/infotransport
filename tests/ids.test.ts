import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverableRefSchema,
  gtfsRouteId,
  gtfsStopId,
  isLineRef,
  isStopRef,
  lineRefSchema,
  lineReportsPath,
  siriLineRef,
  stopRefSchema,
} from '../src/shared/ids.js';

test('SIRI stop and line references are recognised strictly', () => {
  assert.ok(isStopRef('STIF:StopPoint:Q:41210:'));
  assert.ok(isStopRef('STIF:StopArea:SP:71517:'));
  for (const ref of [
    'STIF:StopPoint:Q:41210',
    'STIF:StopArea:Q:1:',
    'DEMO:x',
    'x STIF:StopPoint:Q:1:',
  ])
    assert.ok(!isStopRef(ref), ref);
  assert.ok(isLineRef('STIF:Line::C01740:'));
  for (const ref of ['STIF:Line::01740:', 'STIF:Line:C01740:', 'line:IDFM:C01740', ''])
    assert.ok(!isLineRef(ref), ref);
});

test('zod schemas accept the same references', () => {
  assert.equal(stopRefSchema.parse('STIF:StopArea:SP:71517:'), 'STIF:StopArea:SP:71517:');
  assert.throws(() => stopRefSchema.parse('DEMO:la-defense'));
  assert.equal(lineRefSchema.parse('STIF:Line::C01740:'), 'STIF:Line::C01740:');
  assert.throws(() => lineRefSchema.parse('STIF:StopArea:SP:71517:'));
  assert.equal(discoverableRefSchema.parse('DEMO:la-defense'), 'DEMO:la-defense');
  assert.equal(discoverableRefSchema.parse('STIF:StopPoint:Q:41210:'), 'STIF:StopPoint:Q:41210:');
  for (const ref of ['DEMO:', 'DEMO:a b', 'STIF:Line::C01740:', 42])
    assert.throws(() => discoverableRefSchema.parse(ref), String(ref));
});

test('SIRI identifiers map to GTFS identifiers', () => {
  assert.equal(gtfsStopId('STIF:StopPoint:Q:41210:'), 'IDFM:41210');
  assert.equal(gtfsStopId('STIF:StopArea:SP:71517:'), 'IDFM:monomodalStopPlace:71517');
  assert.equal(gtfsStopId('DEMO:x'), undefined);
  assert.equal(gtfsRouteId('STIF:Line::C01740:'), 'IDFM:C01740');
  assert.equal(gtfsRouteId(''), undefined);
});

test('SIRI line references map to and from Navitia', () => {
  assert.equal(
    lineReportsPath('STIF:Line::C01740:'),
    'v2/navitia/line_reports/lines/line:IDFM:C01740/line_reports',
  );
  assert.throws(() => lineReportsPath('C01740'), /Identifiant de ligne invalide/);
  assert.equal(siriLineRef('line:IDFM:C01740'), 'STIF:Line::C01740:');
  assert.equal(siriLineRef('line:IDFM:C01740:x'), undefined);
  assert.equal(siriLineRef(''), undefined);
});
