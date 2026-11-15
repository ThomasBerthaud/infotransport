import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { configSchema, initialConfig } from '../src/shared/model.js';
import { minimalDebugMarkup } from '../src/shared/minimal-debug.js';

test('screen debug is opt-in and survives configuration validation', () => {
  const config = structuredClone(initialConfig);
  assert.equal(minimalDebugMarkup(configSchema.parse(config).screen.debugDimensions), '');
  config.screen.debugDimensions = true;
  assert.equal(configSchema.parse(config).screen.debugDimensions, true);
  config.screen.debugDimensions = false;
  assert.equal(minimalDebugMarkup(configSchema.parse(config).screen.debugDimensions), '');
  assert.equal(
    configSchema.safeParse({ ...config, screen: { ...config.screen, debugDimensions: 'true' } })
      .success,
    false,
  );
});

test('debug measures the viewport rather than the configured grid and updates on resize', () => {
  const html = minimalDebugMarkup(true);
  const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
  const badge = { textContent: '' };
  const listeners: Record<string, () => void> = {};
  const window = {
    innerWidth: 600,
    innerHeight: 480,
    addEventListener: (name: string, handler: () => void) => {
      listeners[name] = handler;
    },
  };
  runInNewContext(script, {
    window,
    document: {
      documentElement: { clientWidth: 600, clientHeight: 480, scrollWidth: 1200 },
      getElementById: () => badge,
    },
  });
  assert.equal(badge.textContent, 'Zone utile : 600 × 480 px');
  window.innerWidth = 480;
  window.innerHeight = 600;
  listeners.resize();
  assert.equal(badge.textContent, 'Zone utile : 480 × 600 px');
});

test('sandboxed preview shows its simulated viewport without executing scripts', () => {
  const html = minimalDebugMarkup(true, { width: 800, height: 600 });
  assert.match(html, /Zone utile : 800 × 600 px/);
  assert.doesNotMatch(html, /<script>/);
});
