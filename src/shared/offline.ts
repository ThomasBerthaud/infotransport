import {
  active,
  departureWindow,
  refreshDelay,
  type BlockView,
  type Dashboard,
  type Departure,
  type TimetablesResponse,
} from './model.js';

/** Saved real-time departures and incidents are no longer shown after this delay. */
export const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Departures that left less than this long ago are still shown, as on the server. */
export const PAST_GRACE_MS = 30 * 1000;
/** The browser asks for timetables at most this often unless they changed on the server. */
export const TIMETABLES_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Last dashboard received from the server, kept in the browser. */
export type Snapshot = { savedAt: string; dashboard: Dashboard };
/** Timetables kept in the browser with what they were fetched for. */
export type StoredTimetables = TimetablesResponse & { fetchedAt: string; signature: string };

/** Identifies what a timetable download depends on: server import and configured blocks. */
export function timetablesSignature(dashboard: Dashboard): string {
  return JSON.stringify([
    dashboard.timetables ?? '',
    dashboard.config.blocks.map((b) => [
      b.id,
      b.monitoringRef,
      b.lineRef,
      b.directionRef,
      b.destinationRef,
    ]),
  ]);
}

/** Whether the browser should download the timetables again. */
export function timetablesDue(
  dashboard: Dashboard,
  stored: StoredTimetables | undefined,
  now: Date,
): boolean {
  if (!dashboard.timetables) return false;
  return (
    !stored ||
    stored.signature !== timetablesSignature(dashboard) ||
    now.getTime() - Date.parse(stored.fetchedAt) >= TIMETABLES_REFRESH_MS
  );
}

const minuteKey = (time: string) => Math.floor(Date.parse(time) / 60000);

/**
 * Departures to show for one block while offline: saved real-time departures that have
 * not left yet, completed with later planned departures over the block's departure window.
 */
export function offlineDepartures(
  saved: Departure[],
  scheduled: TimetablesResponse['blocks'][string],
  lineRef: string,
  effective: Parameters<typeof departureWindow>[2],
  now: Date,
): Departure[] {
  const from = now.getTime() - PAST_GRACE_MS;
  const memorised = saved
    .filter((d) => Date.parse(d.time) >= from)
    .map((d): Departure => ({ ...d, source: 'snapshot' }));
  // A planned departure is the same trip as a saved one when their planned minute matches.
  const known = new Set(memorised.map((d) => minuteKey(d.aimedTime ?? d.time)));
  // Saved data covered the horizon PRIM announced: only add what comes after it.
  const after = Math.max(
    from,
    ...saved.map((d) => Math.max(Date.parse(d.time), Date.parse(d.aimedTime ?? d.time))),
  );
  const planned = scheduled
    .filter((d) => {
      const time = Date.parse(d.time);
      return (
        time >= from && (memorised.length ? time > after : true) && !known.has(minuteKey(d.time))
      );
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    .map((d): Departure => ({
      id: `scheduled-${d.time}`,
      time: d.time,
      aimedTime: d.time,
      destination: d.destination,
      lineRef,
      cancelled: false,
      realtime: false,
      source: 'scheduled',
    }));
  return departureWindow([...memorised, ...planned], now.toISOString(), effective);
}

/**
 * Rebuilds the dashboard from what the browser saved when the server cannot be reached.
 * Returns undefined when nothing was saved: the layout itself is unknown.
 */
export function offlineDashboard(
  snapshot: Snapshot | undefined,
  timetables: StoredTimetables | undefined,
  now: Date,
): Dashboard | undefined {
  if (!snapshot) return undefined;
  const { dashboard } = snapshot;
  const config = dashboard.config;
  const expired = now.getTime() - Date.parse(snapshot.savedAt) > SNAPSHOT_MAX_AGE_MS;
  const timetablesUsable =
    !!timetables &&
    timetables.signature === timetablesSignature(dashboard) &&
    now.getTime() < Date.parse(timetables.validUntil);
  const paused = !active(config.defaults, now);
  let scheduledShown = false;
  const blocks = dashboard.blocks.map((view): BlockView => {
    const base = {
      block: view.block,
      effective: view.effective,
      lineAppearance: view.lineAppearance,
    };
    if (paused || !active(view.effective, now))
      return { ...base, departures: [], incidents: [], status: 'paused', trafficKnown: false };
    if (view.status === 'unconfigured')
      return {
        ...base,
        departures: [],
        incidents: [],
        status: 'unconfigured',
        trafficKnown: false,
      };
    const departures = offlineDepartures(
      expired || view.status === 'paused' ? [] : view.departures,
      timetablesUsable ? (timetables.blocks[view.block.id] ?? []) : [],
      view.block.lineRef,
      view.effective,
      now,
    );
    if (departures.some((d) => d.source === 'scheduled')) scheduledShown = true;
    const incidents =
      expired || view.status === 'paused'
        ? []
        : view.incidents.filter((i) => !i.ends || Date.parse(i.ends) > now.getTime());
    return {
      ...base,
      departures,
      incidents,
      status: departures.length ? 'ok' : 'empty',
      trafficKnown: !expired && view.status !== 'paused' && view.trafficKnown,
    };
  });
  return {
    ...dashboard,
    now: now.toISOString(),
    paused,
    refreshSeconds: refreshDelay(config, now),
    blocks,
    offline: { savedAt: snapshot.savedAt, expired, scheduled: scheduledShown },
  };
}
