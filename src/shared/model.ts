import { z } from 'zod';
import { formatParis, localParts } from './paris-time.js';

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
export const MAX_BLOCKS_PER_PROFILE = 12;
export const MAX_PROFILES = 8;
/** Profile positions are limited to a widened Île-de-France. */
export const LOCATION_BOUNDS = { lat: [48, 49.4], lon: [1.3, 3.7] } as const;
export const RADIUS_RANGE = [100, 20000] as const;
export const DEFAULT_RADIUS = 1000;
/** Beyond this reported accuracy (metres), the device position does not choose a profile. */
export const MAX_POSITION_ACCURACY = 2000;
export const locationSchema = z.object({
  lat: z.number().min(LOCATION_BOUNDS.lat[0]).max(LOCATION_BOUNDS.lat[1]),
  lon: z.number().min(LOCATION_BOUNDS.lon[0]).max(LOCATION_BOUNDS.lon[1]),
  radius: z.number().int().min(RADIUS_RANGE[0]).max(RADIUS_RANGE[1]).default(DEFAULT_RADIUS),
  label: z.string().trim().max(60).optional(),
});
export type ProfileLocation = z.infer<typeof locationSchema>;
const profileSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(40),
    grid: z.object({
      columns: z.number().int().min(1).max(12).default(2),
      rows: z.number().int().min(1).max(12).optional(),
    }),
    location: locationSchema.optional(),
    blocks: z.array(blockSchema).min(0).max(MAX_BLOCKS_PER_PROFILE),
  })
  .transform((profile) => ({
    ...profile,
    grid: {
      ...profile.grid,
      rows: profile.grid.rows ?? Math.max(1, layout(profile.blocks, profile.grid.columns).rows),
    },
  }));
export type Profile = z.infer<typeof profileSchema>;
const V1_PROFILE_ID = 'principal';
/**
 * Version 1 had a single list of blocks and the grid in `screen`: it becomes one default
 * profile « Principal », without position, with the same blocks and grid.
 */
function migrateConfig(input: unknown): unknown {
  if (!input || typeof input !== 'object' || (input as { version?: unknown }).version !== 1)
    return input;
  const { screen, blocks, ...rest } = input as {
    screen?: Record<string, unknown>;
    blocks?: unknown;
  };
  const { columns, rows, ...device } = screen ?? {};
  return {
    ...rest,
    version: 2,
    screen: device,
    defaultProfileId: V1_PROFILE_ID,
    profiles: [{ id: V1_PROFILE_ID, name: 'Principal', grid: { columns, rows }, blocks }],
  };
}
export const configSchema = z.preprocess(
  migrateConfig,
  z.object({
    version: z.literal(2),
    defaults: settingsSchema,
    screen: z.object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160),
      refreshSeconds: z.number().int().min(15).max(3600),
      debugDimensions: z.boolean().optional(),
    }),
    defaultProfileId: z.string().min(1).max(80),
    profiles: z.array(profileSchema).min(1).max(MAX_PROFILES),
  }),
);
export type Config = z.infer<typeof configSchema>;
/** Blocks of every profile, in profile order. Block ids are unique across profiles. */
export const allBlocks = (config: Pick<Config, 'profiles'>): Block[] =>
  config.profiles.flatMap((profile) => profile.blocks);
export const profileById = (config: Pick<Config, 'profiles'>, id: string | undefined | null) =>
  id ? config.profiles.find((profile) => profile.id === id) : undefined;
/** The profile shown on the minimal view and whenever no other profile applies. */
export const defaultProfile = (config: Pick<Config, 'profiles' | 'defaultProfileId'>): Profile =>
  profileById(config, config.defaultProfileId) ?? config.profiles[0]!;
export type DevicePosition = { lat: number; lon: number; accuracy?: number };
export type ProfileChoice = { profile: Profile; reason: 'manual' | 'nearest' | 'default' };
/** Great-circle distance in metres (haversine). */
export function distanceMeters(
  a: Pick<DevicePosition, 'lat' | 'lon'>,
  b: Pick<DevicePosition, 'lat' | 'lon'>,
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/**
 * A valid manual choice wins; otherwise the nearest profile whose radius contains the
 * position (the first in order on a tie); otherwise the default profile.
 */
export function chooseProfile(
  config: Pick<Config, 'profiles' | 'defaultProfileId'>,
  position?: DevicePosition,
  manualId?: string | null,
): ProfileChoice {
  const manual = profileById(config, manualId);
  if (manual) return { profile: manual, reason: 'manual' };
  if (position && !((position.accuracy ?? 0) > MAX_POSITION_ACCURACY)) {
    let best: { profile: Profile; distance: number } | undefined;
    for (const profile of config.profiles) {
      if (!profile.location) continue;
      const distance = distanceMeters(position, profile.location);
      if (distance <= profile.location.radius && (!best || distance < best.distance))
        best = { profile, distance };
    }
    if (best) return { profile: best.profile, reason: 'nearest' };
  }
  return { profile: defaultProfile(config), reason: 'default' };
}
/** The dashboard restricted to the blocks of one profile. */
export const dashboardForProfile = (dashboard: Dashboard, profileId: string): Dashboard => ({
  ...dashboard,
  blocks: dashboard.blocks.filter((view) => view.profileId === profileId),
});
/** Pairs of profiles whose areas overlap: in the shared area, the nearest one wins. */
export function overlappingProfiles(config: Pick<Config, 'profiles'>): [Profile, Profile][] {
  const located = config.profiles.filter((p) => p.location);
  const pairs: [Profile, Profile][] = [];
  for (let i = 0; i < located.length; i++)
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i]!.location!;
      const b = located[j]!.location!;
      if (distanceMeters(a, b) < a.radius + b.radius) pairs.push([located[i]!, located[j]!]);
    }
  return pairs;
}
/** Reads « 48.89, 2.24 » or « 48,89 2,24 » pasted from a map; undefined otherwise. */
export function parseCoordinates(text: string): { lat: number; lon: number } | undefined {
  const match = text.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!match) return undefined;
  const lat = Number(match[1]!.replace(',', '.'));
  const lon = Number(match[2]!.replace(',', '.'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;
}
const defaultSettings: Settings = {
  walkMinutes: 14,
  minimalCount: 3,
  richCount: 8,
  pollSeconds: 600,
  start: '05:00',
  end: '22:00',
  days: [1, 2, 3, 4, 5, 6, 7],
};
const demoBlock = (
  id: string,
  station: string,
  line: string,
  direction: string,
  lineRef: string,
): Block => ({
  id,
  station,
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
  version: 2,
  defaults: defaultSettings,
  screen: { width: 800, height: 600, refreshSeconds: 60 },
  defaultProfileId: V1_PROFILE_ID,
  profiles: [{ id: V1_PROFILE_ID, name: 'Principal', grid: { columns: 2, rows: 2 }, blocks: [] }],
};
export const demoConfig: Config = {
  ...initialConfig,
  defaultProfileId: 'la-defense',
  profiles: [
    {
      id: 'la-defense',
      name: 'La Défense',
      grid: { columns: 2, rows: 2 },
      location: { lat: 48.8919, lon: 2.2378, radius: 1000, label: 'La Défense' },
      blocks: [
        demoBlock('la-defense-l', 'La Défense', 'L', 'Paris Saint-Lazare', 'STIF:Line::C01740:'),
        demoBlock('la-defense-u', 'La Défense', 'U', 'La Verrière', 'STIF:Line::C01741:'),
      ],
    },
    {
      id: 'saint-lazare',
      name: 'Saint-Lazare',
      grid: { columns: 2, rows: 1 },
      location: { lat: 48.8763, lon: 2.3253, radius: 1000, label: 'Paris Saint-Lazare' },
      blocks: [
        demoBlock(
          'saint-lazare-l',
          'Paris Saint-Lazare',
          'L',
          'Versailles Rive Droite',
          'STIF:Line::C01740:',
        ),
      ],
    },
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
  /** Profile the block belongs to. */
  profileId: string;
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
  for (const block of allBlocks(config)) {
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
  const blocks = allBlocks(c);
  if (new Set(blocks.map((b) => b.id)).size !== blocks.length)
    throw new ConfigError('Chaque bloc doit avoir un identifiant unique, tous profils confondus.');
  if (new Set(c.profiles.map((p) => p.id)).size !== c.profiles.length)
    throw new ConfigError('Chaque profil doit avoir un identifiant unique.');
  if (new Set(c.profiles.map((p) => p.name.toLocaleLowerCase('fr'))).size !== c.profiles.length)
    throw new ConfigError('Deux profils ne peuvent pas porter le même nom.');
  if (!profileById(c, c.defaultProfileId))
    throw new ConfigError('Le profil par défaut doit faire partie des profils.');
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

export function minimalGridSize(c: Pick<Config, 'screen'>): { width: number; height: number } {
  // Content estimates only drive warnings; they must not enlarge the configured screen.
  return { width: c.screen.width, height: c.screen.height };
}

/** Warnings about one profile's minimal grid, the default profile unless another is given. */
export function minimalWarnings(
  c: Config,
  overflowingBlocks?: readonly string[],
  profile: Profile = defaultProfile(c),
): string[] {
  const warnings: string[] = [];
  const { blocks, grid } = profile;
  for (const block of blocks) {
    if (shownInMinimal(block) && block.span > grid.columns)
      warnings.push(
        `Le bloc « ${block.station} · ${block.line} » occupe ${block.span} colonnes, mais la grille n’en a que ${grid.columns}.`,
      );
  }
  const { cells, rows: usedRows } = layout(blocks, grid.columns);
  if (usedRows > grid.rows)
    warnings.push(
      `La disposition nécessite ${usedRows} lignes, mais la grille n’en a que ${grid.rows}.`,
    );
  for (const cell of cells) {
    const b = blocks.find((item) => item.id === cell.id)!;
    const width = (c.screen.width * cell.span) / grid.columns;
    const height = c.screen.height / grid.rows;
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
export const hour = (time: string) => formatParis(time, { hour: '2-digit', minute: '2-digit' });
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
