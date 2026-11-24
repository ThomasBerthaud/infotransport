import { z } from 'zod';
import { loadCatalog, type Catalog } from './catalog.js';
import {
  active,
  allBlocks,
  ConfigError,
  departureWindow,
  previewWindowSettings,
  profileById,
  demoConfig,
  initialConfig,
  refreshDelay,
  settings,
  validateConfig,
  type Block,
  type BlockView,
  type Config,
  type Dashboard,
  type Departure,
  type Discovery,
  type Incident,
} from '../shared/model.js';
import { Budget, Store } from './storage.js';
import { discover, lineReportsPath, parseDepartures, parseLineReports, Prim } from './prim.js';
import { demoDepartures, demoDiscovery, demoIncidents } from './demo.js';
import { NotFoundError, toHttpError, UnavailableError } from './errors.js';
import { log } from './log.js';
import { Timetables } from './timetables.js';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
/**
 * How long a page request waits for an on-demand collection before answering with the
 * cache. Below PRIM's 12 s timeout so the target screen never hangs; an unfinished
 * collection carries on and updates the cache for the next request.
 */
export const DEMAND_WAIT_MS = 5 * SECOND_MS;
/** Traffic messages are collected at a fixed pace, independent of block settings. */
const TRAFFIC_INTERVAL_MS = 15 * MINUTE_MS;
/** Traffic older than this is reported as unknown rather than "no incident". */
const TRAFFIC_FRESH_MS = 30 * MINUTE_MS;
/** A departure lookup made from the admin is reused for this long. */
const DISCOVERY_TTL_MS = 3 * MINUTE_MS;
/** Departures stay displayable for max(STALE_MIN_MS, poll interval × STALE_POLL_FACTOR). */
const STALE_MIN_MS = 5 * MINUTE_MS;
const STALE_POLL_FACTOR = 2.5;
/** After a failed collection, wait twice the poll interval, capped at this value. */
const MAX_RETRY_MS = 60 * MINUTE_MS;
/** Departures that left less than this long ago are still shown. */
const PAST_GRACE_MS = 30 * SECOND_MS;

type Entry<T> = { at: number; data: T; error?: string; next: number };
type Cache = {
  stops: Record<string, Entry<Departure[]>>;
  traffic: Record<string, Entry<Incident[]>>;
};

const describe = (error: unknown) =>
  error instanceof z.ZodError || error instanceof ConfigError
    ? toHttpError(error).message
    : error instanceof Error
      ? error.message
      : String(error);

export class Service {
  catalog!: Catalog;
  config!: Config;
  cache!: Cache;
  budget!: Budget;
  prim!: Prim;
  readonly timetables: Timetables;
  readonly mode: 'demo' | 'live';
  /** Collection in progress, shared by concurrent requests (single-flight). */
  private inflight?: Promise<void>;
  private mutation: Promise<unknown> = Promise.resolve();
  /** Last unexpected collection error. */
  error?: string;
  /** Set when the stored configuration could not be used at startup. */
  configError?: string;
  constructor(
    private store: Store,
    private key: string,
  ) {
    this.mode = key.trim() ? 'live' : 'demo';
    this.timetables = new Timetables(store.directory);
  }
  async init() {
    log.info(`Initialisation du service en mode ${this.mode}`);
    this.catalog = await loadCatalog();
    this.config = await this.loadConfig();
    const cache = await this.store.read<Cache & { searches?: unknown }>('cache.json', {
      stops: {},
      traffic: {},
    });
    if (!cache.stops || !cache.traffic) throw new Error('Cache persistant invalide.');
    // Older versions stored an unused search cache.
    delete cache.searches;
    this.cache = cache;
    this.budget = new Budget(
      this.store,
      await this.store.read('budget.json', { reservations: [] }),
    );
    this.prim = new Prim(this.key, this.budget, () => this.online());
    await this.timetables.refresh();
    if (this.mode === 'live') await this.store.write('config.json', this.config);
    log.info(
      `Service initialisé · ${allBlocks(this.config).length} blocs · ${this.config.profiles.length} profils · budgets ${this.budget
        .counts()
        .apis.map((quota) => `${quota.api} ${quota.used}/${quota.limit}`)
        .join(' · ')}`,
    );
  }
  /**
   * A stored configuration that no longer validates (schema or quota change, manual edit)
   * must not keep the container in a restart loop: set it aside and start from defaults.
   */
  private async loadConfig(): Promise<Config> {
    const fallback = this.mode === 'live' ? initialConfig : demoConfig;
    let problem: unknown;
    try {
      return validateConfig(await this.store.read('config.json', fallback));
    } catch (error) {
      problem = error;
    }
    const saved = await this.store.quarantine('config.json');
    this.configError = `La configuration enregistrée était invalide (${describe(problem)}). Elle a été conservée sous ${saved} et remplacée par la configuration initiale.`;
    log.error(this.configError);
    return validateConfig(fallback);
  }
  async save(input: unknown) {
    const work = this.mutation
      .catch(() => {})
      .then(async () => {
        const config = validateConfig(input);
        if (this.mode === 'live') await this.store.write('config.json', config);
        this.config = config;
        this.configError = undefined;
        if (this.mode === 'live' && this.prune(Date.now()))
          await this.store.write('cache.json', this.cache);
        log.info(
          `Configuration enregistrée · ${allBlocks(config).length} blocs · ${config.profiles.length} profils`,
        );
        return config;
      });
    this.mutation = work;
    return work;
  }
  /**
   * Called when a displayed page asks for data: collects the resources whose cache entry
   * is due, waiting at most `waitMs` for the result. Never rejects; unexpected errors are
   * logged and reported in the diagnostics.
   */
  async demand({ waitMs = DEMAND_WAIT_MS }: { waitMs?: number } = {}) {
    if (this.mode === 'demo' || !this.online()) return;
    const work = this.refresh().catch((error: unknown) => {
      log.error(`[COLLECTE] Erreur inattendue : ${describe(error)}`);
      this.error = describe(error);
    });
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
    clearTimeout(timer);
  }
  private online(now = new Date()) {
    return active(this.config.defaults, now);
  }
  private configured(b: Block) {
    return (
      /^STIF:Stop(?:Area:SP|Point:Q):\d+:$/.test(b.monitoringRef) &&
      /^STIF:Line::C\d+:$/.test(b.lineRef) &&
      !!(b.directionRef || b.destinationRef) &&
      !b.directionRef.startsWith('DEMO:') &&
      !b.destinationRef.startsWith('DEMO:') &&
      !b.directionRef.startsWith('demo-')
    );
  }
  /**
   * Collects one resource unless its cached entry is still valid. Errors keep the
   * previous data and postpone the next attempt. Returns whether the cache changed.
   */
  private async collect<T>(
    entries: Record<string, Entry<T>>,
    label: string,
    ref: string,
    now: number,
    intervalMs: number,
    retryMs: number,
    fetch: () => Promise<T>,
  ): Promise<boolean> {
    const old = entries[ref];
    if (old && now < old.next) {
      log.debug(`[COLLECTE] ${label} ${ref} — cache valide`);
      return false;
    }
    // The night pause may begin during a collection: stop calling, but keep what was collected.
    if (!this.online()) return false;
    try {
      const data = await fetch();
      entries[ref] = { at: Date.now(), data, next: Date.now() + intervalMs };
      log.debug(`[COLLECTE] ${label} ${ref} — collecte réussie`);
    } catch (error) {
      // Refused because the pause began meanwhile: abandon without recording an error.
      if (!this.online()) return false;
      log.warn(`[COLLECTE] ${label} ${ref} — ${describe(error)}`);
      entries[ref] = {
        at: old?.at ?? 0,
        data: old?.data ?? ([] as T),
        error: describe(error),
        next: Date.now() + retryMs,
      };
    }
    return true;
  }
  /** Drops cache entries no block uses any more; recent lookups stay for discovery. */
  private prune(now: number) {
    const stops = new Set(allBlocks(this.config).map((b) => b.monitoringRef));
    const lines = new Set(allBlocks(this.config).map((b) => b.lineRef));
    let changed = false;
    for (const [ref, entry] of Object.entries(this.cache.stops))
      if (!stops.has(ref) && now - entry.at >= DISCOVERY_TTL_MS) {
        delete this.cache.stops[ref];
        changed = true;
      }
    for (const ref of Object.keys(this.cache.traffic))
      if (!lines.has(ref)) {
        delete this.cache.traffic[ref];
        changed = true;
      }
    return changed;
  }
  /**
   * Collects every due resource of the active blocks. Concurrent calls share the same
   * collection; nothing runs in demo mode or outside the active hours.
   */
  refresh(): Promise<void> {
    if (this.mode === 'demo' || !this.online()) return Promise.resolve();
    this.inflight ??= this.collectAll().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }
  private async collectAll() {
    let dirty = false;
    try {
      const now = Date.now();
      const config = this.config;
      const blocks = allBlocks(config).filter(
        (b) => this.configured(b) && active(settings(config, b), new Date()),
      );
      const stops = new Map<string, number>();
      const lines = new Set<string>();
      for (const b of blocks) {
        const poll = settings(config, b).pollSeconds * SECOND_MS;
        stops.set(b.monitoringRef, Math.min(stops.get(b.monitoringRef) ?? Infinity, poll));
        lines.add(b.lineRef);
      }
      const stopTasks = [...stops].map(
        ([ref, poll]) =>
          () =>
            this.collect(
              this.cache.stops,
              'Arrêt',
              ref,
              now,
              poll,
              Math.min(MAX_RETRY_MS, poll * 2),
              async () =>
                parseDepartures(await this.prim.request('stop-monitoring', { MonitoringRef: ref })),
            ),
      );
      const lineTasks = [...lines].map(
        (ref) => () =>
          this.collect(
            this.cache.traffic,
            'Trafic',
            ref,
            now,
            TRAFFIC_INTERVAL_MS,
            TRAFFIC_INTERVAL_MS,
            async () =>
              parseLineReports(
                await this.prim.request(
                  'line-reports',
                  { disable_geojson: 'true' },
                  true,
                  lineReportsPath(ref),
                ),
                ref,
              ),
          ),
      );
      // All resources are collected in parallel; the PRIM client bounds the calls in flight
      // and paces each API. Interleaving lets both APIs progress side by side.
      const tasks = Array.from({ length: Math.max(stopTasks.length, lineTasks.length) }, (_, i) => [
        stopTasks[i],
        lineTasks[i],
      ])
        .flat()
        .filter((task) => task !== undefined);
      const results = await Promise.allSettled(tasks.map((task) => task()));
      dirty = results.some((r) => r.status === 'fulfilled' && r.value);
      const failure = results.find((r) => r.status === 'rejected');
      if (failure) throw failure.reason;
      dirty = this.prune(Date.now()) || dirty;
    } finally {
      if (dirty) await this.store.write('cache.json', this.cache);
    }
  }
  async search(q: string) {
    return this.catalog.search(q);
  }
  async discovery(ref: string): Promise<Discovery> {
    if (this.mode === 'demo') return demoDiscovery(this.catalog.lines(ref));
    const recent = () => {
      const cached = this.cache.stops[ref];
      return cached && Date.now() - cached.at < DISCOVERY_TTL_MS ? cached : undefined;
    };
    const old = recent();
    if (old) return discover(old.data);
    const work = this.mutation
      .catch(() => {})
      .then(async () => {
        if (!this.online())
          throw new UnavailableError('Les appels PRIM sont suspendus hors des plages actives.');
        const cached = recent();
        if (cached) return discover(cached.data);
        const data = parseDepartures(
          await this.prim.request('stop-monitoring', { MonitoringRef: ref }, false),
        );
        this.cache.stops[ref] = { at: Date.now(), data, next: Date.now() + DISCOVERY_TTL_MS };
        await this.store.write('cache.json', this.cache);
        return discover(data);
      });
    this.mutation = work;
    return work;
  }
  /**
   * `preview` widens each block's departure window so the admin preview can apply a draft
   * walking threshold or minimal count that is higher than the saved one.
   * Blocks of every profile are returned, each with its `profileId`, so the browser can
   * choose the profile itself, even offline; `profile` restricts them to one profile.
   */
  dashboard(
    now = new Date(),
    { preview = false, profile }: { preview?: boolean; profile?: string } = {},
  ): Dashboard {
    const config = this.config;
    const paused = !active(config.defaults, now);
    if (profile !== undefined && !profileById(config, profile))
      throw new NotFoundError(`Profil inconnu : ${profile}.`);
    const entries = config.profiles
      .filter((p) => profile === undefined || p.id === profile)
      .flatMap((p) => p.blocks.map((block, index) => ({ profileId: p.id, block, index })));
    const blocks = entries.map(({ profileId, block, index }): BlockView => {
      const effective = settings(config, block);
      const line = this.catalog.line(block.lineRef);
      const lineAppearance = line?.color
        ? { color: line.color, textColor: line.textColor }
        : undefined;
      const isPaused = paused || !active(effective, now);
      const view = { profileId, block, effective, lineAppearance };
      if (isPaused)
        return { ...view, departures: [], incidents: [], status: 'paused', trafficKnown: false };
      const at = now.toISOString();
      const window = preview ? previewWindowSettings(effective) : effective;
      if (this.mode === 'demo')
        return {
          ...view,
          // Demo trains leave at least one minute apart, so this many always covers the window.
          departures: departureWindow(
            demoDepartures(
              block,
              index,
              now,
              window.richCount + window.minimalCount + window.walkMinutes,
            ),
            at,
            window,
          ),
          incidents: demoIncidents(block),
          status: 'ok',
          trafficKnown: true,
        };
      const entry = this.cache.stops[block.monitoringRef];
      const traffic = this.cache.traffic[block.lineRef];
      const fresh =
        !!entry &&
        now.getTime() - entry.at <
          Math.max(STALE_MIN_MS, effective.pollSeconds * SECOND_MS * STALE_POLL_FACTOR);
      const trafficKnown =
        !!traffic && !traffic.error && now.getTime() - traffic.at < TRAFFIC_FRESH_MS;
      const departures = fresh
        ? departureWindow(
            entry.data.filter(
              (d) =>
                d.lineRef === block.lineRef &&
                Date.parse(d.time) >= now.getTime() - PAST_GRACE_MS &&
                (block.directionRef
                  ? d.directionRef === block.directionRef
                  : d.destinationRef === block.destinationRef),
            ),
            at,
            window,
          )
        : [];
      const incidents = trafficKnown
        ? traffic.data.filter(
            (i) =>
              // Only disruptions of this block's line, whatever line was queried.
              i.lineRefs.includes(block.lineRef) &&
              (!i.starts || Date.parse(i.starts) <= now.getTime()) &&
              (!i.ends || Date.parse(i.ends) > now.getTime()),
          )
        : [];
      const status = !this.configured(block)
        ? 'unconfigured'
        : !entry
          ? 'empty'
          : !fresh
            ? 'stale'
            : entry.error
              ? 'error'
              : departures.length
                ? 'ok'
                : 'empty';
      return { ...view, departures, incidents, status, trafficKnown };
    });
    return {
      mode: this.mode,
      now: now.toISOString(),
      paused,
      refreshSeconds: refreshDelay(config, now),
      config,
      blocks,
      timetables: this.timetables.version(now),
    };
  }
  diagnostics() {
    const entries = (cache: Record<string, Entry<unknown>>) =>
      Object.entries(cache).map(([ref, e]) => ({ ref, at: e.at, next: e.next, error: e.error }));
    return {
      mode: this.mode,
      budget: this.budget.counts(),
      error: this.error,
      configError: this.configError,
      catalog: {
        source: this.catalog.data.source,
        importedAt: this.catalog.data.importedAt,
        rowCount: this.catalog.data.rowCount,
      },
      timetables: this.timetables.status(this.config),
      stops: entries(this.cache.stops),
      traffic: entries(this.cache.traffic),
    };
  }
}
