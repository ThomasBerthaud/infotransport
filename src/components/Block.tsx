import type { CSSProperties } from 'react';
import type { BlockView } from '../shared/model.js';
import { hour, isReachable, minutesUntil } from '../shared/model.js';
export function IncidentIcon({ unknown = false }: { unknown?: boolean }) {
  return (
    <svg
      className="incident-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-label={unknown ? 'État du trafic inconnu' : 'Perturbation en cours'}
    >
      <path
        d="M12 3 22 21H2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 9v5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="17.5" r="1" fill="currentColor" />
      {unknown && <title>État du trafic inconnu</title>}
    </svg>
  );
}
export function Line({
  line,
  appearance,
}: {
  line: string;
  appearance?: BlockView['lineAppearance'];
}) {
  const color = appearance?.color;
  const valid = (value?: string) => !!value && /^#[0-9a-f]{6}$/i.test(value);
  const background = valid(color) ? color : undefined;
  const rgb = background
    ?.slice(1)
    .match(/../g)
    ?.map((part) => {
      const channel = parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  const luminance = rgb ? rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 : 0;
  const foreground = valid(appearance?.textColor)
    ? appearance?.textColor
    : luminance > 0.179
      ? '#000000'
      : '#FFFFFF';
  const style = background
    ? ({ '--line-color': background, '--line-text-color': foreground } as CSSProperties)
    : undefined;
  return (
    <span className="line-symbol" style={style}>
      {line}
    </span>
  );
}
export function BlockHeading({ view, colored = false }: { view: BlockView; colored?: boolean }) {
  return (
    <div className="block-heading">
      <div className="station-line">
        <Line line={view.block.line} appearance={colored ? view.lineAppearance : undefined} />
        <h2>{view.block.station}</h2>
        {(view.incidents.length > 0 || !view.trafficKnown) && view.status !== 'paused' && (
          <span className={view.incidents.length ? 'traffic-warning' : 'traffic-unknown'}>
            <IncidentIcon unknown={!view.trafficKnown} />
          </span>
        )}
      </div>
      <p className="direction">
        <span aria-hidden="true">→ </span>
        {view.block.direction}
      </p>
    </div>
  );
}
export function MinimalBlock({ view, now }: { view: BlockView; now: string }) {
  // Departures that leave too soon to be caught are hidden; the threshold is the one
  // the detailed view uses to grey them out.
  const reachable = view.departures.filter((d) =>
    isReachable(d.time, now, view.effective.walkMinutes),
  );
  const departures = reachable.slice(0, view.effective.minimalCount);
  const hidden = view.departures.length - reachable.length > 0;
  return (
    <section
      className="minimal-block"
      aria-label={`${view.block.station}, ligne ${view.block.line}, direction ${view.block.direction}${hidden ? ', départs trop proches masqués' : ''}`}
    >
      <BlockHeading view={view} />
      <table className="minimal-times">
        <tbody>
          <tr>
            {Array.from({ length: view.effective.minimalCount }, (_, i) => {
              const d = departures[i];
              const marker = hidden && i === 0 && (
                <span className="minimal-hidden-marker" aria-hidden="true" />
              );
              return (
                <td key={d?.id ?? i}>
                  {d ? (
                    <>
                      <strong>
                        {marker}
                        {d.cancelled ? 'SUP.' : minutesUntil(d.time, now)}
                        {!d.cancelled && <small> min</small>}
                      </strong>
                      <time dateTime={d.time}>{hour(d.time)}</time>
                    </>
                  ) : (
                    <strong>{marker}—</strong>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
