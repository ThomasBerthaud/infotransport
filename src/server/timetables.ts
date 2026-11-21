import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import type {
  Block,
  Config,
  Departure,
  ScheduledDeparture,
  TimetablesResponse,
} from '../shared/model.js';

// Scheduled timetables imported by hand from the IDFM GTFS feed ("Offre horaires TC GTFS
// IDFM", Licence Mobilités). Only the configured blocks are kept, in /data/timetables.json.

export const TIMETABLES_FILE = 'timetables.json';
/** At most this many service days are kept from the feed, which covers about 30 days. */
export const MAX_IMPORT_DAYS = 14;
/** The browser receives departures over this window. */
export const BROWSER_WINDOW_MS = 48 * 60 * 60 * 1000;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const departureSchema = z.object({ time: z.string(), destination: z.string() });
const keySchema = z.object({
  monitoringRef: z.string(),
  lineRef: z.string(),
  directionRef: z.string(),
  destinationRef: z.string(),
});
export const timetableFileSchema = z.object({
  version: z.literal(1),
  source: z.string(),
  importedAt: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  entries: z.array(
    z.object({ key: keySchema, label: z.string(), departures: z.array(departureSchema) }),
  ),
});
export type TimetableFile = z.infer<typeof timetableFileSchema>;
type TimetableKey = z.infer<typeof keySchema>;

/** Blocks with the same stop, line and direction share their timetable. */
export const keyOf = (b: Pick<Block, keyof TimetableKey>): string =>
  JSON.stringify([b.monitoringRef, b.lineRef, b.directionRef, b.destinationRef]);
const labelOf = (b: Block) => `${b.station} · ${b.line} → ${b.direction}`;

// ---------------------------------------------------------------------------
// Identifiers. The IDFM GTFS documentation gives `IDFM:[ArRId]` for bus, tram and metro
// stops (SIRI `STIF:StopPoint:Q:[ArRId]:`), `IDFM:monomodalStopPlace:[ZdAId]` for RER and
// Transilien stops (SIRI `STIF:StopArea:SP:[ZdAId]:`) and `IDFM:CXXXXX` for lines.

export function gtfsStopId(siriRef: string): string | undefined {
  const quay = /^STIF:StopPoint:Q:(\d+):$/.exec(siriRef)?.[1];
  if (quay) return `IDFM:${quay}`;
  const area = /^STIF:StopArea:SP:(\d+):$/.exec(siriRef)?.[1];
  return area ? `IDFM:monomodalStopPlace:${area}` : undefined;
}
export function gtfsRouteId(lineRef: string): string | undefined {
  const code = /^STIF:Line::(C\d+):$/.exec(lineRef)?.[1];
  return code ? `IDFM:${code}` : undefined;
}
/** Destination names are compared without case, accents or punctuation. */
export const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---------------------------------------------------------------------------
// Dates and times. GTFS times count from "noon minus 12 h" of the service day in the
// agency time zone, so they stay right on daylight saving days and may exceed 24:00.

const parisOffset = (t: number) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, Number(p.value)]),
  );
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - t
  );
};
/** `YYYYMMDD` → UTC midnight of that calendar date, used as a day counter. */
const dayNumber = (date: string) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
const dateOf = (day: number) => new Date(day).toISOString().slice(0, 10).replace(/-/g, '');
/** Instant of `HH:MM:SS` on a service day. */
export function serviceTime(date: string, time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  const utcNoon = dayNumber(date) + 12 * HOUR_MS;
  const noon = utcNoon - parisOffset(utcNoon);
  return noon - 12 * HOUR_MS + ((h * 60 + m) * 60 + (s || 0)) * 1000;
}
/** Paris calendar date of an instant, as `YYYYMMDD`. */
export function parisDate(t: number): string {
  return dateOf(t + parisOffset(t));
}
/** Instant of Paris midnight starting `date`. */
const parisMidnight = (date: string) => serviceTime(date, '12:00:00') - 12 * HOUR_MS;

// ---------------------------------------------------------------------------
// GTFS reading: plain CSV, quoted fields without line breaks, read line by line because
// stop_times.txt is too large to load.

export function splitCsv(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else field += char;
  }
  fields.push(field);
  return fields;
}
async function eachRow(
  path: string,
  onRow: (row: Record<string, string>) => void,
  optional = false,
) {
  try {
    await access(path);
  } catch {
    if (optional) return;
    throw new Error(`Fichier GTFS manquant : ${path}.`);
  }
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header: string[] | undefined;
  for await (const raw of lines) {
    const line = raw.replace(/^﻿/, '');
    if (!line.trim()) continue;
    const fields = splitCsv(line);
    if (!header) {
      header = fields.map((f) => f.trim());
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((name, i) => (row[name] = fields[i] ?? ''));
    onRow(row);
  }
}

type Calendar = { days: boolean[]; start: string; end: string };
/** Service ids running on each date of the import window. */
async function services(dir: string, from: string, days: number) {
  const calendars = new Map<string, Calendar>();
  const exceptions = new Map<string, Map<string, boolean>>();
  let lastDate = '';
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  await eachRow(
    join(dir, 'calendar.txt'),
    (row) => {
      calendars.set(row.service_id, {
        days: weekdays.map((d) => row[d] === '1'),
        start: row.start_date,
        end: row.end_date,
      });
      if (row.end_date > lastDate) lastDate = row.end_date;
    },
    true,
  );
  await eachRow(
    join(dir, 'calendar_dates.txt'),
    (row) => {
      let dates = exceptions.get(row.service_id);
      if (!dates) exceptions.set(row.service_id, (dates = new Map()));
      dates.set(row.date, row.exception_type === '1');
      if (row.exception_type === '1' && row.date > lastDate) lastDate = row.date;
    },
    true,
  );
  if (!calendars.size && !exceptions.size)
    throw new Error('Ni calendar.txt ni calendar_dates.txt : calendrier GTFS introuvable.');
  const first = dayNumber(from);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = dateOf(first + i * DAY_MS);
    if (date > lastDate) break;
    dates.push(date);
  }
  const running = (service: string, date: string) => {
    const exception = exceptions.get(service)?.get(date);
    if (exception !== undefined) return exception;
    const calendar = calendars.get(service);
    if (!calendar || date < calendar.start || date > calendar.end) return false;
    // getUTCDay: 0 = Sunday; calendar.days: 0 = Monday.
    return calendar.days[(new Date(dayNumber(date)).getUTCDay() + 6) % 7];
  };
  return { dates, running };
}

/** Real-time departures already received, used to learn the destinations of a direction. */
export type KnownDepartures = Record<string, { data: Departure[] }>;

type Target = {
  block: Block;
  stopId?: string;
  routeId?: string;
  terminusIds: Set<string>;
  names: Set<string>;
};
/**
 * Which trips a block follows. A block filters real-time departures by direction or by
 * destination; the GTFS describes trips by their last stop and its name. A trip is kept
 * when its last stop or headsign matches a destination of the block: the one configured,
 * and those PRIM announced for the block's direction.
 */
function target(block: Block, known: KnownDepartures): Target {
  const terminusIds = new Set<string>();
  const names = new Set<string>();
  const add = (ref?: string, name?: string) => {
    const id = ref && gtfsStopId(ref);
    if (id) terminusIds.add(id);
    if (name && normalizeName(name)) names.add(normalizeName(name));
  };
  if (!block.directionRef) add(block.destinationRef, block.direction);
  for (const d of known[block.monitoringRef]?.data ?? [])
    if (
      d.lineRef === block.lineRef &&
      (block.directionRef
        ? d.directionRef === block.directionRef
        : d.destinationRef === block.destinationRef)
    )
      add(d.destinationRef, d.destination);
  return {
    block,
    stopId: gtfsStopId(block.monitoringRef),
    routeId: gtfsRouteId(block.lineRef),
    terminusIds,
    names,
  };
}

export type ImportResult = TimetableFile & { uncovered: string[] };

/** Builds the timetable file for the configured blocks from an unzipped GTFS folder. */
export async function importTimetables({
  dir,
  config,
  known = {},
  now = new Date(),
  source = 'GTFS IDFM',
}: {
  dir: string;
  config: Config;
  known?: KnownDepartures;
  now?: Date;
  source?: string;
}): Promise<ImportResult> {
  const targets = [
    ...new Map(config.blocks.map((b) => [keyOf(b), target(b, known)])).values(),
  ].filter((t) => t.stopId && t.routeId && (t.terminusIds.size || t.names.size));
  // Start one day early: trips of yesterday's service day may run after midnight.
  const today = parisDate(now.getTime());
  const yesterday = dateOf(dayNumber(today) - DAY_MS);
  const { dates, running } = await services(dir, yesterday, MAX_IMPORT_DAYS + 1);
  if (dates.length < 2) throw new Error('Le fichier GTFS ne couvre pas la journée en cours.');
  const lastDate = dates.at(-1)!;
  const validFrom = now.toISOString();
  const validUntil = new Date(parisMidnight(dateOf(dayNumber(lastDate) + DAY_MS))).toISOString();

  const routes = new Set(targets.map((t) => t.routeId!));
  const stops = new Set(targets.map((t) => t.stopId!));
  type Trip = { route: string; service: string; headsign: string; last?: [number, string] };
  const trips = new Map<string, Trip>();
  await eachRow(join(dir, 'trips.txt'), (row) => {
    if (routes.has(row.route_id))
      trips.set(row.trip_id, {
        route: row.route_id,
        service: row.service_id,
        headsign: row.trip_headsign,
      });
  });
  // Calls at a followed stop, kept until the trip's last stop is known.
  const calls: { trip: string; stop: string; time: string; sequence: number }[] = [];
  await eachRow(join(dir, 'stop_times.txt'), (row) => {
    const trip = trips.get(row.trip_id);
    if (!trip) return;
    const sequence = Number(row.stop_sequence);
    if (!trip.last || sequence > trip.last[0]) trip.last = [sequence, row.stop_id];
    if (
      stops.has(row.stop_id) &&
      row.pickup_type !== '1' &&
      (row.departure_time || row.arrival_time)
    )
      calls.push({
        trip: row.trip_id,
        stop: row.stop_id,
        time: row.departure_time || row.arrival_time,
        sequence,
      });
  });

  const from = now.getTime() - HOUR_MS;
  const until = Date.parse(validUntil);
  const byKey = new Map<string, Map<number, ScheduledDeparture>>();
  for (const call of calls) {
    const trip = trips.get(call.trip)!;
    // The trip ends here: nobody can board it.
    if (!trip.last || trip.last[0] === call.sequence) continue;
    const terminus = trip.last[1];
    for (const t of targets) {
      if (t.stopId !== call.stop || t.routeId !== trip.route) continue;
      if (!t.terminusIds.has(terminus) && !t.names.has(normalizeName(trip.headsign))) continue;
      const key = keyOf(t.block);
      let departures = byKey.get(key);
      if (!departures) byKey.set(key, (departures = new Map()));
      for (const date of dates) {
        if (!running(trip.service, date)) continue;
        const time = serviceTime(date, call.time);
        if (time < from || time >= until) continue;
        // Two GTFS trips at the same minute towards the same place are one departure.
        departures.set(Math.floor(time / 60000), {
          time: new Date(time).toISOString(),
          destination: trip.headsign,
        });
      }
    }
  }
  const entries = [...new Map(config.blocks.map((b) => [keyOf(b), b])).values()].map((block) => ({
    key: {
      monitoringRef: block.monitoringRef,
      lineRef: block.lineRef,
      directionRef: block.directionRef,
      destinationRef: block.destinationRef,
    },
    label: labelOf(block),
    departures: [...(byKey.get(keyOf(block))?.values() ?? [])].sort((a, b) =>
      a.time.localeCompare(b.time),
    ),
  }));
  return {
    version: 1,
    source,
    importedAt: now.toISOString(),
    validFrom,
    validUntil,
    entries,
    uncovered: entries.filter((e) => !e.departures.length).map((e) => e.label),
  };
}

// ---------------------------------------------------------------------------
// Runtime: the server reads the file written by the import and notices a new import by
// its modification time, without restarting.

export type TimetablesStatus = {
  state: 'missing' | 'invalid' | 'expired' | 'ok';
  importedAt?: string;
  validUntil?: string;
  source?: string;
  /** Configured blocks without any scheduled departure. */
  uncovered: string[];
  error?: string;
};

export class Timetables {
  private data?: TimetableFile;
  private mtime = -1;
  private error?: string;
  private loading?: Promise<void>;
  constructor(private directory: string) {}
  /** Reloads the file when it changed; cheap enough to call on every request. */
  refresh(): Promise<void> {
    return (this.loading ??= this.load().finally(() => (this.loading = undefined)));
  }
  private async load() {
    const path = join(this.directory, TIMETABLES_FILE);
    let mtime: number;
    try {
      mtime = (await stat(path)).mtimeMs;
    } catch {
      this.data = undefined;
      this.error = undefined;
      this.mtime = -1;
      return;
    }
    if (mtime === this.mtime) return;
    this.mtime = mtime;
    try {
      this.data = timetableFileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      this.error = undefined;
    } catch {
      this.data = undefined;
      this.error = `Fichier ${TIMETABLES_FILE} illisible. Relancez l’import des horaires théoriques.`;
    }
  }
  private usable(now: Date) {
    return this.data && now.getTime() < Date.parse(this.data.validUntil) ? this.data : undefined;
  }
  /** Import date announced to the browser so it downloads a new import. */
  version(now = new Date()) {
    return this.usable(now)?.importedAt;
  }
  status(config: Config, now = new Date()): TimetablesStatus {
    if (this.error) return { state: 'invalid', uncovered: [], error: this.error };
    if (!this.data) return { state: 'missing', uncovered: [] };
    const covered = new Set(
      this.data.entries.filter((e) => e.departures.length).map((e) => keyOf(e.key)),
    );
    return {
      state: this.usable(now) ? 'ok' : 'expired',
      importedAt: this.data.importedAt,
      validUntil: this.data.validUntil,
      source: this.data.source,
      uncovered: config.blocks.filter((b) => !covered.has(keyOf(b))).map(labelOf),
    };
  }
  /** Departures of each configured block from now on, over the browser window. */
  forBrowser(config: Config, now = new Date()): TimetablesResponse | undefined {
    const data = this.usable(now);
    if (!data) return undefined;
    const end = Math.min(now.getTime() + BROWSER_WINDOW_MS, Date.parse(data.validUntil));
    const entries = new Map(data.entries.map((e) => [keyOf(e.key), e.departures]));
    const blocks: TimetablesResponse['blocks'] = {};
    for (const block of config.blocks)
      blocks[block.id] = (entries.get(keyOf(block)) ?? []).filter((d) => {
        const time = Date.parse(d.time);
        return time >= now.getTime() - HOUR_MS && time < end;
      });
    return {
      importedAt: data.importedAt,
      validUntil: data.validUntil,
      until: new Date(end).toISOString(),
      blocks,
    };
  }
}
