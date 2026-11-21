import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  budgetLevel,
  destinationSuggestions,
  directionSuggestions,
  lineSuggestions,
  moveBlock,
  newBlock,
  stopSuggestions,
  withOverride,
  withOwnSchedule,
} from '../src/client/admin/blocks.js';
import { BlockOverrides, DisplayFields } from '../src/client/admin/BlockEditor.js';
import { initialConfig, settings, type Block } from '../src/shared/model.js';

const block = (patch: Partial<Block> = {}): Block => ({
  id: 'b0',
  station: 'La Défense',
  line: 'L',
  direction: 'Paris Saint-Lazare',
  monitoringRef: 'STIF:StopArea:SP:1:',
  lineRef: 'STIF:Line::C01740:',
  directionRef: '',
  destinationRef: '',
  span: 2,
  overrides: {},
  ...patch,
});

test('catalog suggestions describe mode, lines and references', () => {
  const [stop] = stopSuggestions([
    {
      label: 'La Défense',
      monitoringRef: 'STIF:StopArea:SP:1:',
      city: 'Puteaux',
      mode: 'LocalTrain',
      lines: [
        { ref: 'a', label: 'L' },
        { ref: 'b', label: 'U' },
      ],
    },
  ]);
  assert.equal(stop.value, 'STIF:StopArea:SP:1:');
  assert.equal(stop.detail, 'Puteaux · Train · L, U · STIF:StopArea:SP:1:');
  const [line] = lineSuggestions([
    { ref: 'STIF:Line::C01740:', label: 'L', name: 'L', mode: 'Unknown', operator: 'SNCF' },
  ]);
  assert.equal(line.detail, 'Unknown · SNCF · STIF:Line::C01740:');
  assert.ok(line.visualLabel);
});

test('directions fall back to the destination reference and destinations need one', () => {
  const directions = [
    { lineRef: 'l', name: 'Nord', directionRef: 'outbound', destinationRef: '' },
    { lineRef: 'l', name: 'Sud', directionRef: '', destinationRef: 'dest-2' },
  ];
  assert.deepEqual(
    directionSuggestions(directions).map((d) => d.value),
    ['outbound', 'dest-2'],
  );
  assert.deepEqual(
    destinationSuggestions(directions).map((d) => d.value),
    ['dest-2'],
  );
});

test('overrides can be set and removed to inherit the common value again', () => {
  const custom = withOverride(block(), 'walkMinutes', 5);
  assert.deepEqual(custom.overrides, { walkMinutes: 5 });
  assert.deepEqual(withOverride(custom, 'walkMinutes', undefined).overrides, {});
});

test('a block schedule starts from effective values and is removed as a whole', () => {
  const config = structuredClone(initialConfig);
  const b = block({ overrides: { walkMinutes: 3 } });
  const own = withOwnSchedule(b, settings(config, b), true);
  assert.deepEqual(own.overrides, {
    walkMinutes: 3,
    start: '05:00',
    end: '22:00',
    days: [1, 2, 3, 4, 5, 6, 7],
  });
  own.overrides.days!.push(8);
  assert.equal(config.defaults.days.length, 7);
  assert.deepEqual(withOwnSchedule(own, settings(config, own), false).overrides, {
    walkMinutes: 3,
  });
});

test('blocks move within bounds and new blocks span the full grid', () => {
  const blocks = ['a', 'b', 'c'].map((id) => block({ id }));
  assert.deepEqual(
    moveBlock(blocks, 0, 1).map((b) => b.id),
    ['b', 'a', 'c'],
  );
  assert.equal(moveBlock(blocks, 0, -1), blocks);
  assert.equal(moveBlock(blocks, 2, 1), blocks);
  const fresh = newBlock(3);
  assert.equal(fresh.span, 3);
  assert.notEqual(fresh.id, newBlock(3).id);
});

test('budget level thresholds', () => {
  assert.equal(budgetLevel(undefined, 1000), 'unknown');
  assert.equal(budgetLevel(799, 1000), 'normal');
  assert.equal(budgetLevel(800, 1000), 'warning');
  assert.equal(budgetLevel(900, 1000), 'critical');
  assert.equal(budgetLevel(1000, 1000), 'exhausted');
});

test('block editor sections render overrides and label fields', () => {
  const config = structuredClone(initialConfig);
  const b = block({ overrides: { pollSeconds: 300 } });
  config.profiles[0].blocks = [b];
  const overrides = renderToStaticMarkup(
    createElement(BlockOverrides, { block: b, config, onChange: () => {} }),
  );
  assert.match(overrides, /Personnalisé pour ce bloc/);
  assert.match(overrides, /Réglage commun : 14 min/);
  assert.doesNotMatch(overrides, /Début des mises à jour/);
  const scheduled = renderToStaticMarkup(
    createElement(BlockOverrides, {
      block: withOwnSchedule(b, settings(config, b), true),
      config,
      onChange: () => {},
    }),
  );
  assert.match(scheduled, /Début des mises à jour/);
  const display = renderToStaticMarkup(
    createElement(DisplayFields, { block: b, columns: 2, onChange: () => {} }),
  );
  assert.match(display, /value="La Défense"/);
  assert.match(display, /2 colonnes · toute la largeur/);
});
