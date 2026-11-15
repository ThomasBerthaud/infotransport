import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialConfig,
  minimalBlockSize,
  minimalGridSize,
  minimalWarnings,
  type Block,
} from '../src/shared/model.js';

test('minimal capacity estimates follow labels and inherited departure counts', () => {
  const config = structuredClone(initialConfig);
  const block: Block = {
    id: 'test',
    station: 'A',
    line: 'L',
    direction: 'B',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 1,
    overrides: {},
  };
  config.blocks = [block];
  const original = minimalBlockSize(config, block);
  config.defaults.minimalCount = 5;
  assert.ok(minimalBlockSize(config, block).width > original.width);
  block.overrides.minimalCount = 3;
  assert.deepEqual(minimalBlockSize(config, block), original);

  for (const field of ['station', 'line', 'direction'] as const) {
    const longer = { ...block, [field]: 'W'.repeat(field === 'line' ? 12 : 40) };
    assert.ok(minimalBlockSize(config, longer).width > original.width, field);
  }

  block.span = 2;
  config.screen.width = original.width;
  config.screen.height = original.height * config.screen.rows;
  assert.deepEqual(minimalWarnings(config), []);
  block.direction = 'W'.repeat(40);
  assert.ok(minimalWarnings(config).length > 0);
});

test('minimal grid keeps the configured screen dimensions even when content overflows', () => {
  const config = structuredClone(initialConfig);
  config.screen = { ...config.screen, width: 600, height: 480, columns: 2, rows: 4 };
  config.blocks = [
    {
      id: 'wide',
      station: 'W'.repeat(40),
      line: 'L',
      direction: 'Paris Saint-Lazare',
      monitoringRef: '',
      lineRef: '',
      directionRef: '',
      destinationRef: '',
      span: 1,
      overrides: { minimalCount: 5 },
    },
  ];

  assert.ok(minimalBlockSize(config, config.blocks[0]).width > config.screen.width);
  assert.ok(minimalWarnings(config).length > 0);
  assert.deepEqual(minimalGridSize(config), { width: 600, height: 480 });

  config.blocks[0].span = 2;
  assert.deepEqual(minimalGridSize(config), { width: 600, height: 480 });
  config.blocks = [];
  assert.deepEqual(minimalGridSize(config), { width: 600, height: 480 });
});

test('measured content replaces capacity estimates while keeping structural warnings', () => {
  const config = structuredClone(initialConfig);
  config.screen = { ...config.screen, width: 600, height: 800, columns: 2, rows: 1 };
  config.blocks = ['Maria Valtat', 'Paddock Paris'].map((station, index) => ({
    id: String(index),
    station,
    line: '247',
    direction: 'Sens aller · démonstration',
    monitoringRef: '',
    lineRef: '',
    directionRef: '',
    destinationRef: '',
    span: 1,
    overrides: { minimalCount: 2 },
  }));
  assert.equal(minimalWarnings(config).length, 2);
  assert.deepEqual(minimalWarnings(config, []), []);
  assert.deepEqual(minimalWarnings(config, ['1']), [
    'Le bloc « Paddock Paris · 247 » ne tient pas lisiblement dans l’écran épuré.',
  ]);
  config.blocks[0].span = 3;
  assert.match(minimalWarnings(config, []).join(' '), /occupe 3 colonnes/);
  assert.match(minimalWarnings(config, []).join(' '), /nécessite 2 lignes/);
});
