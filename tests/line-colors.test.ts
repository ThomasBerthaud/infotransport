import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadCatalog } from '../src/server/catalog.js';
import { Service } from '../src/server/service.js';
import { Store } from '../src/server/storage.js';
import { BlockHeading, Line } from '../src/components/Block.js';

test('official colors are matched by line ID, including identically named lines', async () => {
  const catalog = await loadCatalog();
  assert.equal(catalog.line('STIF:Line::C01740:')?.color, '#C4A4CC');
  assert.equal(catalog.line('STIF:Line::C01741:')?.color, '#B6134C');
  assert.notEqual(catalog.line('STIF:Line::C01904:')?.color, '#C4A4CC');
  assert.equal(catalog.line('unknown'), undefined);
});

test('dashboard carries official colors to rich headings while minimal headings stay monochrome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'infotransport-colors-'));
  try {
    const service = new Service(new Store(dir), '');
    await service.init();
    const view = service.dashboard(new Date('2026-10-26T10:00:00Z')).blocks[0];
    assert.equal(view.lineAppearance?.color, '#C4A4CC');
    const rich = renderToStaticMarkup(createElement(BlockHeading, { view, colored: true }));
    const minimal = renderToStaticMarkup(createElement(BlockHeading, { view }));
    assert.match(rich, /--line-color:#C4A4CC;--line-text-color:#000000/);
    assert.doesNotMatch(minimal, /--line-color/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unknown or invalid colors use neutral badges and missing text color gets a readable fallback', () => {
  const render = (appearance?: { color: string; textColor?: string }) =>
    renderToStaticMarkup(createElement(Line, { line: '42', appearance }));
  assert.doesNotMatch(render(), /style=/);
  assert.doesNotMatch(render({ color: 'red;display:none' }), /style=/);
  assert.match(render({ color: '#FFFFFF' }), /--line-text-color:#000000/);
  assert.match(render({ color: '#000000' }), /--line-text-color:#FFFFFF/);
});
