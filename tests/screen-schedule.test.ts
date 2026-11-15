import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialConfig, refreshDelay } from '../src/shared/model.js';
import { Service } from '../src/server/service.js';
import { Store } from '../src/server/storage.js';

test('screens stop their regular refresh at closing and wake only at the next opening', () => {
  const config = structuredClone(initialConfig);
  config.screen.refreshSeconds = 60;
  const cases = [
    ['2026-10-26T20:58:00Z', 60],
    ['2026-10-26T20:59:50Z', 10],
    ['2026-10-26T21:00:00Z', 7 * 3600],
    ['2026-10-27T03:59:50Z', 10],
    ['2026-10-27T04:00:00Z', 60],
  ] as const;
  for (const [time, expected] of cases) {
    assert.equal(refreshDelay(config, new Date(time)), expected, time);
  }
});

test('screen wake-up skips disabled days and handles overnight and all-day schedules', () => {
  const config = structuredClone(initialConfig);
  config.defaults.days = [1, 2, 3, 4, 5];
  assert.equal(refreshDelay(config, new Date('2026-10-30T21:00:00Z')), 55 * 3600);

  config.defaults = { ...config.defaults, start: '22:00', end: '05:00', days: [1] };
  assert.equal(refreshDelay(config, new Date('2026-10-26T20:59:50Z')), 10);
  assert.equal(refreshDelay(config, new Date('2026-10-27T03:59:50Z')), 10);
  assert.equal(refreshDelay(config, new Date('2026-10-27T04:00:00Z')), 161 * 3600);

  config.defaults = { ...config.defaults, start: '00:00', end: '00:00' };
  assert.equal(refreshDelay(config, new Date('2026-10-26T23:00:00Z')), 6 * 86400);
});

test('screen wake-up follows Paris time across both daylight-saving changes', () => {
  assert.equal(refreshDelay(initialConfig, new Date('2026-03-28T21:00:00Z')), 6 * 3600);
  assert.equal(refreshDelay(initialConfig, new Date('2026-10-24T20:00:00Z')), 8 * 3600);
});

test('live and demo dashboards give both screens the same paused wake-up deadline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'infotransport-screen-schedule-'));
  try {
    for (const key of ['', 'test-key']) {
      const service = new Service(new Store(directory), key);
      await service.init();
      const closing = service.dashboard(new Date('2026-10-26T21:00:00Z'));
      assert.equal(closing.paused, true);
      assert.equal(closing.refreshSeconds, 7 * 3600);
      assert.ok(closing.blocks.every((block) => block.status === 'paused'));

      const opening = service.dashboard(new Date('2026-10-27T04:00:00Z'));
      assert.equal(opening.paused, false);
      assert.equal(opening.refreshSeconds, service.config.screen.refreshSeconds);
      assert.equal(service.budget.counts().used, 0);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
