import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const MAX_WALK_MINUTES = 120;
const MAX_MINIMAL_COUNT = 5;
export const settingsSchema = z.object({
  walkMinutes: z.number().int().min(0).max(MAX_WALK_MINUTES),
  minimalCount: z.number().int().min(1).max(MAX_MINIMAL_COUNT),
  richCount: z.number().int().min(3).max(30),
  pollSeconds: z.number().int().min(60).max(3600),
  start: time,
  end: time,
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});
export type Settings = z.infer<typeof settingsSchema>;
export const blockSchema = z.object({
  id: z.string().min(1).max(80),
  station: z.string().trim().min(1).max(60),
  line: z.string().trim().min(1).max(12),
  direction: z.string().trim().min(1).max(70),
  monitoringRef: z.string().max(150),
  lineRef: z.string().max(100),
  directionRef: z.string().max(150).default(''),
  destinationRef: z.string().max(150).default(''),
  span: z.number().int().min(1).max(12),
  hideInMinimal: z.boolean().optional(),
  overrides: settingsSchema.partial(),
});
export type Block = z.infer<typeof blockSchema>;
export const configSchema = z
  .object({
    version: z.literal(1),
    defaults: settingsSchema,
    screen: z.object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160),
      refreshSeconds: z.number().int().min(15).max(3600),
      columns: z.number().int().min(1).max(12).default(2),
      rows: z.number().int().min(1).max(12).optional(),
      debugDimensions: z.boolean().optional(),
    }),
    blocks: z.array(blockSchema).min(0).max(12),
  })
  .transform((config) => ({
    ...config,
    screen: {
      ...config.screen,
      rows: config.screen.rows ?? Math.max(1, layout(config.blocks, config.screen.columns).rows),
    },
  }));
export type Config = z.infer<typeof configSchema>;
const defaultSettings: Settings = {
  walkMinutes: 14,
  minimalCount: 3,
  richCount: 8,
  pollSeconds: 600,
  start: '05:00',
  end: '22:00',
  days: [1, 2, 3, 4, 5, 6, 7],
};
const demoBlock = (id: string, line: string, direction: string, lineRef: string): Block => ({
  id,
  station: 'La Défense',
  line,
  direction,
  monitoringRef: '',
  lineRef,
  directionRef: '',
  destinationRef: '',
  span: 2,
  overrides: {},
});
export const initialConfig: Config = {
  version: 1,
  defaults: defaultSettings,
  screen: { width: 800, height: 600, refreshSeconds: 60, columns: 2, rows: 2 },
  blocks: [],
};
export const demoConfig: Config = {
  ...initialConfig,
  blocks: [
    demoBlock('la-defense-l', 'L', 'Paris Saint-Lazare', 'STIF:Line::C01740:'),
    demoBlock('la-defense-u', 'U', 'La Verrière', 'STIF:Line::C01741:'),
  ],
};
export function settings(config: Config, block: Block): Settings {
  return { ...config.defaults, ...block.overrides };
}
export type Departure = {
  id: string;
  time: string;
  aimedTime?: string;
  destination: string;
  destinationRef?: string;
  directionRef?: string;
  lineRef: string;
  cancelled: boolean;
  /** PRIM sent an expected time; `false` means PRIM only knows the planned time. */
  realtime: boolean;
  platform?: string;
  mission?: string;
  /**
   * Where the browser got this departure. Absent means the server's current data.
   * `snapshot`: last real-time data saved on the device; `scheduled`: imported timetable.
   */
  source?: DepartureSource;
};
export type DepartureSource = 'realtime' | 'snapshot' | 'scheduled';
export type Incident = {
  id: string;
  title: string;
  text: string;
  lineRefs: string[];
  starts?: string;
  ends?: string;
  url?: string;
};
export type BlockView = {
  block: Block;
  effective: Settings;
  lineAppearance?: { color: string; textColor?: string };
  departures: Departure[];
  incidents: Incident[];
  status: 'ok' | 'stale' | 'empty' | 'paused' | 'unconfigured' | 'error';
  trafficKnown: boolean;
};
export type Dashboard = {
  mode: 'demo' | 'live';
  now: string;
  paused: boolean;
  refreshSeconds: number;
  config: Config;
  blocks: BlockView[];
  /** Import date of the scheduled timetables the server can provide, if any. */
  timetables?: string;
  /** Set by the browser when the server is unreachable and saved data is shown instead. */
  offline?: {
    /** Server time of the saved real-time data. */
    savedAt: string;
    /** The saved real-time departures and incidents are too old to be shown. */
    expired: boolean;
    /** At least one scheduled departure completes the saved data. */
    scheduled: boolean;
  };
};
/** One planned departure from the imported GTFS timetables. */
export type ScheduledDeparture = { time: string; destination: string };
/** `GET /api/timetables`: planned departures of each configured block over a short window. */
export type TimetablesResponse = {
  importedAt: string;
  /** End of the imported validity period. */
  validUntil: string;
  /** Departures are listed up to this instant. */
  until: string;
  blocks: Record<string, ScheduledDeparture[]>;
};
export type CatalogLine = {
  ref: string;
  label: string;
  name?: string;
  mode?: string;
  operator?: string;
  color?: string;
  textColor?: string;
};
export type CatalogPlace = {
  label: string;
  monitoringRef: string;
  city?: string;
  mode?: string;
  lineRefs?: string[];
  lines?: CatalogLine[];
};
export type Discovery = {
  lines: { ref: string; label: string }[];
  directions: { lineRef: string; name: string; directionRef: string; destinationRef: string }[];
};

const parisFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function localParts(date: Date) {
  const parts = parisFormatter.formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: weekdays.indexOf(value('weekday')) + 1,
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  };
}
const minuteOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export function active(s: Pick<Settings, 'start' | 'end' | 'days'>, now: Date): boolean {
  const { day, minute } = localParts(now);
  const start = minuteOf(s.start);
  const end = minuteOf(s.end);
  if (start === end) return s.days.includes(day);
  if (start < end) return s.days.includes(day) && minute >= start && minute < end;
  return minute >= start
    ? s.days.includes(day)
    : minute < end && s.days.includes(day === 1 ? 7 : day - 1);
}
export function activeMinutes(s: Pick<Settings, 'start' | 'end'>) {
  const diff = minuteOf(s.end) - minuteOf(s.start);
  return diff > 0 ? diff : diff === 0 ? 1440 : diff + 1440;
}
export function refreshDelay(config: Config, now: Date): number {
  const running = active(config.defaults, now);
  for (let offset = 1; offset <= 8 * 1440; offset++) {
    const next = new Date(Math.floor(now.getTime() / 60000) * 60000 + offset * 60000);
    if (active(config.defaults, next) !== running) {
      const seconds = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
      return running ? Math.min(config.screen.refreshSeconds, seconds) : seconds;
    }
  }
  return running ? config.screen.refreshSeconds : 86400;
}
export function layout(blocks: Block[], columns = 2) {
  let row = 0;
  let col = 0;
  const cells = blocks.filter(shownInMinimal).map((block) => {
    if (col > 0 && col + block.span > columns) {
      row++;
      col = 0;
    }
    const cell = { id: block.id, row, col, span: block.span };
    col += block.span;
    if (col >= columns) {
      row++;
      col = 0;
    }
    return cell;
  });
  return { cells, rows: row + (col > 0 ? 1 : 0) };
}
export function shownInMinimal(block: Block): boolean {
  return !block.hideInMinimal;
}
// Quotas du compte PRIM : seules les API utilisées par la collecte sont incluses.
export const primQuotas = [
  {
    api: 'stop-monitoring',
    label: 'Prochains passages · requête unitaire',
    limit: 1000,
    automaticLimit: 900,
  },
  {
    api: 'line-reports',
    label: 'Messages info trafic (Navitia)',
    limit: 1000,
    automaticLimit: 900,
  },
] as const;
export type PrimApi = (typeof primQuotas)[number]['api'];
export type ApiBudget = {
  api: PrimApi;
  label: string;
  used: number;
  automatic: number;
  limit: number;
  automaticLimit: number;
};
export function estimatedCallsByApi(config: Config): Record<PrimApi, number> {
  const stops = new Map<string, number>();
  const lines = new Set<string>();
  for (const block of config.blocks) {
    const s = settings(config, block);
    // Conservative: full global active window, even for a shorter block window.
    const count = Math.ceil(((activeMinutes(config.defaults) + 60) * 60) / s.pollSeconds) + 1;
    const key = block.monitoringRef || block.id;
    stops.set(key, Math.max(stops.get(key) ?? 0, count));
    lines.add(block.lineRef || block.id);
  }
  return {
    'stop-monitoring': [...stops.values()].reduce((a, b) => a + b, 0),
    'line-reports': lines.size * (Math.ceil((activeMinutes(config.defaults) + 60) / 15) + 1),
  };
}
export function estimatedCalls(config: Config) {
  return Object.values(estimatedCallsByApi(config)).reduce((a, b) => a + b, 0);
}
/** A configuration that is well-formed but breaks a business rule. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}
export function validateConfig(input: unknown): Config {
  const c = configSchema.parse(input);
  if (new Set(c.blocks.map((b) => b.id)).size !== c.blocks.length)
    throw new ConfigError('Chaque bloc doit avoir un identifiant unique.');
  const estimates = estimatedCallsByApi(c);
  for (const quota of primQuotas) {
    if (estimates[quota.api] > quota.automaticLimit)
      throw new ConfigError(
        `${quota.label} : collecte estimée à ${estimates[quota.api]} appels/jour pour une limite automatique de ${quota.automaticLimit}. ${quota.api === 'stop-monitoring' ? 'Augmentez l’intervalle de collecte.' : 'Réduisez le nombre de lignes suivies.'}`,
      );
  }
  return c;
}

// Conservative estimates for the fixed Arial sizes in minimal.css, including
// the incident icon so a traffic update does not change the grid dimensions.
export function minimalBlockSize(c: Config, block: Block): { width: number; height: number } {
  const emWidth = (label: string) =>
    [...label].reduce(
      (sum, char) =>
        sum +
        (/\s/.test(char)
          ? 0.4
          : /[MW@#%&]/.test(char)
            ? 1
            : /[A-ZÀ-ÖØ-Þ]/.test(char)
              ? 0.85
              : /[a-zà-öø-ÿ0-9.,:'’-]/.test(char)
                ? 0.7
                : 1.1),
      0,
    );
  const stationWidth = emWidth(block.station) * 23.2 + emWidth(block.line) * 21.6 + 90;
  const directionWidth = emWidth(block.direction) * 19.2 + 25;
  const departuresWidth = Math.max(240, settings(c, block).minimalCount * 90);
  return {
    width: Math.ceil(Math.max(stationWidth, directionWidth, departuresWidth) + 36),
    // All configured departures share one table row; their count affects width only.
    height: 210,
  };
}

export function minimalGridSize(c: Config): { width: number; height: number } {
  // Content estimates only drive warnings; they must not enlarge the configured screen.
  return { width: c.screen.width, height: c.screen.height };
}

export function minimalWarnings(c: Config, overflowingBlocks?: readonly string[]): string[] {
  const warnings: string[] = [];
  for (const block of c.blocks) {
    if (shownInMinimal(block) && block.span > c.screen.columns)
      warnings.push(
        `Le bloc « ${block.station} · ${block.line} » occupe ${block.span} colonnes, mais la grille n’en a que ${c.screen.columns}.`,
      );
  }
  const { cells, rows: usedRows } = layout(c.blocks, c.screen.columns);
  if (usedRows > c.screen.rows)
    warnings.push(
      `La disposition nécessite ${usedRows} lignes, mais la grille n’en a que ${c.screen.rows}.`,
    );
  for (const cell of cells) {
    const b = c.blocks.find((item) => item.id === cell.id)!;
    const width = (c.screen.width * cell.span) / c.screen.columns;
    const height = c.screen.height / c.screen.rows;
    const minimum = minimalBlockSize(c, b);
    if (
      overflowingBlocks
        ? overflowingBlocks.includes(b.id)
        : height < minimum.height || width < minimum.width
    )
      warnings.push(
        `Le bloc « ${b.station} · ${b.line} » ne tient pas lisiblement dans l’écran épuré.`,
      );
  }
  return warnings;
}
export const minutesUntil = (time: string, now: string) =>
  Math.max(0, Math.ceil((Date.parse(time) - Date.parse(now)) / 60000));
export const hour = (time: string) =>
  new Date(time).toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  });
/** A departure can still be caught when it leaves at least `walkMinutes` from now. */
export const isReachable = (time: string, now: string, walkMinutes: number) =>
  minutesUntil(time, now) >= walkMinutes;
/**
 * Departures a block needs: at least `richCount` for the detailed view, extended until
 * `minimalCount` reachable ones are included for the minimal view.
 */
export function departureWindow<T extends Pick<Departure, 'time'>>(
  departures: readonly T[],
  now: string,
  effective: Pick<Settings, 'richCount' | 'minimalCount' | 'walkMinutes'>,
): T[] {
  let reachable = 0;
  let end = 0;
  while (
    end < departures.length &&
    (end < effective.richCount || reachable < effective.minimalCount)
  ) {
    if (isReachable(departures[end].time, now, effective.walkMinutes)) reachable++;
    end++;
  }
  return departures.slice(0, end);
}
/**
 * Settings used to size the departure window of the admin preview: the draft may raise
 * the walking threshold or the minimal count before saving, so the window covers the
 * largest values the schema allows.
 */
export function previewWindowSettings(
  effective: Pick<Settings, 'richCount'>,
): Pick<Settings, 'richCount' | 'minimalCount' | 'walkMinutes'> {
  return {
    richCount: effective.richCount,
    minimalCount: MAX_MINIMAL_COUNT,
    walkMinutes: MAX_WALK_MINUTES,
  };
}
