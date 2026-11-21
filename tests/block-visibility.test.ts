import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  demoConfig,
  estimatedCallsByApi,
  layout,
  minimalWarnings,
  shownInMinimal,
  validateConfig,
} from '../src/shared/model.js';

test('existing blocks stay visible and visibility survives configuration serialization', () => {
  const config = validateConfig(structuredClone(demoConfig));
  assert.ok(config.profiles[0].blocks.every(shownInMinimal));
  const budget = estimatedCallsByApi(config);
  config.profiles[0].blocks[0].hideInMinimal = true;
  const saved = validateConfig(JSON.parse(JSON.stringify(config)));
  assert.equal(saved.profiles[0].blocks.length, 2);
  assert.equal(saved.profiles[0].blocks[0].hideInMinimal, true);
  assert.equal(shownInMinimal(saved.profiles[0].blocks[0]), false);
  assert.deepEqual(estimatedCallsByApi(saved), budget);
  saved.profiles[0].blocks[0].hideInMinimal = false;
  assert.ok(saved.profiles[0].blocks.every(shownInMinimal));
  assert.throws(() =>
    validateConfig({
      ...config,
      profiles: [
        {
          ...config.profiles[0],
          blocks: [{ ...config.profiles[0].blocks[0], hideInMinimal: 'true' }],
        },
      ],
    }),
  );
});

test('hidden blocks leave no gaps or warnings in the minimal grid', () => {
  const config = structuredClone(demoConfig);
  config.screen = { ...config.screen, width: 1600, height: 600 };
  config.profiles[0].grid = { columns: 2, rows: 1 };
  config.profiles[0].blocks = [
    { ...config.profiles[0].blocks[0], span: 12, hideInMinimal: true },
    { ...config.profiles[0].blocks[1], span: 1 },
    { ...config.profiles[0].blocks[1], id: 'third', span: 1 },
  ];
  assert.deepEqual(layout(config.profiles[0].blocks, 2), {
    cells: [
      { id: config.profiles[0].blocks[1].id, row: 0, col: 0, span: 1 },
      { id: 'third', row: 0, col: 1, span: 1 },
    ],
    rows: 1,
  });
  assert.deepEqual(minimalWarnings(config), []);
  assert.deepEqual(minimalWarnings(config, [config.profiles[0].blocks[0].id]), []);
  config.profiles[0].blocks.forEach((block) => {
    block.hideInMinimal = true;
  });
  assert.deepEqual(layout(config.profiles[0].blocks), { cells: [], rows: 0 });
  assert.deepEqual(minimalWarnings(config), []);
});
