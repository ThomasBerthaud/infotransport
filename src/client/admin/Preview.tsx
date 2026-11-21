import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BlockView, Config, Dashboard, Profile } from '../../shared/model.js';
import { layout, minimalGridSize, settings, shownInMinimal } from '../../shared/model.js';
import { MinimalBlock } from '../../components/Block.js';
import { minimalDebugMarkup } from '../../shared/minimal-debug.js';
import minimalCss from '../minimal.css?inline';
import { overflowingMinimalBlocks } from '../minimal-overflow.js';

/** Renders the draft exactly as /minimal would and reports blocks whose text overflows. */
export function Preview({
  config,
  profile,
  dashboard,
  onMeasure,
  hidden = false,
}: {
  config: Config;
  /** Profile of the draft whose minimal grid is shown. */
  profile: Profile;
  dashboard: Dashboard;
  onMeasure: (ids: string[]) => void;
  hidden?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const width =
    Number.isFinite(config.screen.width) && config.screen.width > 0 ? config.screen.width : 800;
  const height =
    Number.isFinite(config.screen.height) && config.screen.height > 0 ? config.screen.height : 600;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { columns, rows } = profile.grid;
  const minimum = minimalGridSize(config);
  const cells = new Map(layout(profile.blocks, columns).cells.map((cell) => [cell.id, cell]));
  const visibleBlocks = profile.blocks.filter(shownInMinimal);
  const html = visibleBlocks
    .map((block) => {
      const old = dashboard.blocks.find((v) => v.block.id === block.id);
      const view: BlockView = old
        ? { ...old, profileId: profile.id, block, effective: settings(config, block) }
        : {
            profileId: profile.id,
            block,
            effective: settings(config, block),
            departures: [],
            incidents: [],
            status: 'empty',
            trafficKnown: false,
          };
      const cell = cells.get(block.id)!;
      return `<div class="minimal-cell" style="top:${(cell.row * 100) / rows}%;left:${(cell.col * 100) / columns}%;width:${(cell.span * 100) / columns}%;height:${100 / rows}%">${renderToStaticMarkup(<MinimalBlock view={view} now={dashboard.now} />)}</div>`;
    })
    .join('');
  const content = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${minimalCss}</style></head><body class="minimal-page"><div class="minimal-grid" style="min-width:${minimum.width}px;min-height:${minimum.height}px">${html}</div>${minimalDebugMarkup(config.screen.debugDimensions, { width, height })}</body></html>`;
  return (
    <div
      ref={container}
      className="minimal-preview"
      aria-hidden={hidden || undefined}
      style={{
        aspectRatio: `${width} / ${height}`,
        ...(hidden ? { position: 'absolute', left: -10000, width, visibility: 'hidden' } : {}),
      }}
    >
      <iframe
        title="Prévisualisation de la vue épurée"
        sandbox="allow-same-origin"
        srcDoc={content}
        onLoad={async (event) => {
          const frame = event.currentTarget;
          const document = frame.contentDocument;
          if (!document) return;
          await document.fonts.ready;
          if (frame.contentDocument !== document || !frame.isConnected) return;
          onMeasure(overflowingMinimalBlocks(document).map((index) => visibleBlocks[index].id));
        }}
        style={{ width, height, transform: `scale(${availableWidth / width})` }}
      />
    </div>
  );
}
