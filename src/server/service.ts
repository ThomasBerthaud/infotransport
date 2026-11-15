import { loadCatalog, type Catalog } from './catalog.js';
import {
  Block,
  BlockView,
  CatalogPlace,
  Config,
  Dashboard,
  demoConfig,
  Departure,
  Discovery,
  Incident,
} from '../shared/model.js';
import { active, initialConfig, refreshDelay, settings, validateConfig } from '../shared/model.js';
import { Budget, Store } from './storage.js';
import { discover, parseDepartures, parseIncidents, Prim } from './prim.js';
type Entry<T> = { at: number; data: T; error?: string; next: number };
type Cache = {
  stops: Record<string, Entry<Departure[]>>;
  traffic: Record<string, Entry<Incident[]>>;
  searches: Record<string, { at: number; data: CatalogPlace[] }>;
};
export class Service {
  catalog!: Catalog;
  config!: Config;
  cache!: Cache;
  budget!: Budget;
  prim!: Prim;
  readonly mode: 'demo' | 'live';
  private running = false;
  private mutation: Promise<unknown> = Promise.resolve();
  error?: string;
  timer?: NodeJS.Timeout;
  constructor(
    private store: Store,
    private key: string,
  ) {
    this.mode = key.trim() ? 'live' : 'demo';
  }
  async init() {
    console.log(`Initialisation du service… en mode ${this.mode}`);
    this.catalog = await loadCatalog();
    this.config = validateConfig(
      await this.store.read('config.json', this.mode === 'live' ? initialConfig : demoConfig),
    );
    this.cache = await this.store.read<Cache>('cache.json', {
      stops: {},
      traffic: {},
      searches: {},
    });
    if (!this.cache.stops || !this.cache.traffic || !this.cache.searches)
      throw new Error('Cache persistant invalide.');
    this.budget = new Budget(
      this.store,
      await this.store.read('budget.json', { reservations: [] }),
    );
    this.prim = new Prim(this.key, this.budget, () => active(this.config.defaults, new Date()));
    if (this.mode === 'live') {
      await this.store.write('config.json', this.config);
    }
    console.log(
      `Service initialisé · ${this.config.blocks.length} blocs · budgets ${this.budget
        .counts()
        .apis.map((quota) => `${quota.api} ${quota.used}/${quota.limit}`)
        .join(' · ')}`,
    );
  }
  async save(input: unknown) {
    const work = this.mutation
      .catch(() => {})
      .then(async () => {
        const config = validateConfig(input);
        if (this.mode === 'live') {
          await this.store.write('config.json', config);
        }
        this.config = config;
        return config;
      });
    this.mutation = work;
    return work;
  }
  start() {
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        console.error(`[TICK] Erreur inattendue : ${error}`);
        this.error = (error as Error).message;
      });
    }, 5000);
    this.timer.unref();
    void this.tick().catch((error) => {
      console.error(`[TICK] Erreur inattendue : ${error}`);
      this.error = (error as Error).message;
    });
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
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
  private assertOnline() {
    if (!active(this.config.defaults, new Date()))
      throw new Error('Les appels PRIM sont suspendus hors des plages actives.');
  }
  async tick() {
    if (this.running || this.mode === 'demo' || !active(this.config.defaults, new Date())) return;
    this.running = true;
    try {
      const now = Date.now();
      const config = this.config;
      const blocks = config.blocks.filter(
        (b) => this.configured(b) && active(settings(config, b), new Date()),
      );
      console.log(`[TICK] ${blocks.length} bloc(s) à rafraîchir`);
      const stops = new Map<string, number>();
      const lines = new Set<string>();
      for (const b of blocks) {
        stops.set(
          b.monitoringRef,
          Math.min(stops.get(b.monitoringRef) ?? Infinity, settings(config, b).pollSeconds),
        );
        lines.add(b.lineRef);
      }
      for (const [ref, poll] of stops) {
        this.assertOnline();
        const old = this.cache.stops[ref];
        if (old && now < old.next) {
          console.log(`[TICK] Arrêt ${ref} — cache valide, saut`);
          continue;
        }
        try {
          const data = parseDepartures(
            await this.prim.request('stop-monitoring', { MonitoringRef: ref }),
          );
          this.cache.stops[ref] = { at: Date.now(), data, next: Date.now() + poll * 1000 };
          console.log(`[TICK] Arrêt ${ref} — ${data.length} départ(s) récupéré(s)`);
        } catch (error) {
          console.error(`[TICK] Arrêt ${ref} — ERREUR : ${(error as Error).message}`);
          this.cache.stops[ref] = {
            at: old?.at ?? 0,
            data: old?.data ?? [],
            error: (error as Error).message,
            next: Date.now() + Math.min(3600, poll * 2) * 1000,
          };
        }
      }
      for (const ref of lines) {
        this.assertOnline();
        const old = this.cache.traffic[ref];
        if (old && now < old.next) {
          console.log(`[TICK] Trafic ${ref} — cache valide, saut`);
          continue;
        }
        try {
          const data = parseIncidents(await this.prim.request('general-message', { LineRef: ref }));
          this.cache.traffic[ref] = { at: Date.now(), data, next: Date.now() + 900000 };
          console.log(`[TICK] Trafic ${ref} — ${data.length} incident(s)`);
        } catch (error) {
          console.error(`[TICK] Trafic ${ref} — ERREUR : ${(error as Error).message}`);
          this.cache.traffic[ref] = {
            at: old?.at ?? 0,
            data: old?.data ?? [],
            error: (error as Error).message,
            next: Date.now() + 900000,
          };
        }
      }
      await this.store.write('cache.json', this.cache);
      console.log('[TICK] Terminé');
    } finally {
      this.running = false;
    }
  }
  async search(q: string) {
    return this.catalog.search(q);
  }
  async discovery(ref: string): Promise<Discovery> {
    if (this.mode === 'demo') {
      const lines = this.catalog.lines(ref);
      return {
        lines: lines.map((line) => ({ ref: line.ref, label: line.label })),
        directions: lines.flatMap((line) => {
          const names =
            line.ref === 'STIF:Line::C01740:'
              ? ['Paris Saint-Lazare', 'Versailles Rive Droite']
              : line.ref === 'STIF:Line::C01741:'
                ? ['La Défense', 'La Verrière']
                : ['Sens aller · démonstration', 'Sens retour · démonstration'];
          return names.map((name, index) => ({
            lineRef: line.ref,
            name,
            directionRef: `DEMO:direction:${line.ref}:${index}`,
            destinationRef: `DEMO:destination:${line.ref}:${index}`,
          }));
        }),
      };
    }
    const old = this.cache.stops[ref];
    if (old && Date.now() - old.at < 180000) return discover(old.data);
    const work = this.mutation
      .catch(() => {})
      .then(async () => {
        this.assertOnline();
        const cached = this.cache.stops[ref];
        if (cached && Date.now() - cached.at < 180000) return discover(cached.data);
        const data = parseDepartures(
          await this.prim.request('stop-monitoring', { MonitoringRef: ref }, false),
        );
        this.cache.stops[ref] = { at: Date.now(), data, next: Date.now() + 180000 };
        await this.store.write('cache.json', this.cache);
        return discover(data);
      });
    this.mutation = work;
    return work;
  }
  dashboard(now = new Date()): Dashboard {
    const config = this.config;
    const paused = !active(config.defaults, now);
    const blocks = config.blocks.map((block, index): BlockView => {
      const effective = settings(config, block);
      const line = this.catalog.line(block.lineRef);
      const lineAppearance = line?.color
        ? { color: line.color, textColor: line.textColor }
        : undefined;
      const isPaused = paused || !active(effective, now);
      if (this.mode === 'demo') {
        const base = Math.floor(now.getTime() / 60000) * 60000;
        const departures: Departure[] = Array.from(
          { length: Math.max(effective.richCount, effective.minimalCount) },
          (_, i) => ({
            id: `demo-${block.id}-${i}`,
            time: new Date(
              base + (index ? 6 : 3) * 60000 + i * (index ? 14 : 8) * 60000,
            ).toISOString(),
            aimedTime: new Date(
              base +
                (index ? 6 : 3) * 60000 +
                i * (index ? 14 : 8) * 60000 -
                (index === 0 && i === 1 ? 180000 : 0),
            ).toISOString(),
            destination: block.direction,
            lineRef: block.lineRef,
            cancelled: false,
            realtime: true,
            platform: index ? 'B' : 'A',
            mission: index ? 'DEFI' : 'PASA',
          }),
        );
        const incidents: Incident[] =
          index === 0
            ? [
                {
                  id: 'demo-incident',
                  title: 'Ralentissements vers Paris Saint-Lazare',
                  text: 'Exemple fictif : un incident de signalisation entraîne des retards de quelques minutes entre La Défense et Paris Saint-Lazare. Les trains continuent de circuler. Ce message illustre l’affichage des informations complètes en mode démonstration.',
                  lineRefs: [block.lineRef],
                },
              ]
            : index === 1
              ? [
                  {
                    id: 'demo-incident-u',
                    title: 'Desserte adaptée vers La Verrière',
                    text: 'Exemple fictif : des travaux entraînent une adaptation de la desserte sur la ligne U. Vérifiez les horaires annoncés avant de rejoindre la gare. Les trains en direction de La Verrière restent accessibles. Ce message sert à tester la navigation entre plusieurs informations et ne décrit pas un incident réel.',
                    lineRefs: [block.lineRef],
                  },
                ]
              : [];
        return {
          block,
          effective,
          lineAppearance,
          departures: isPaused ? [] : departures,
          incidents: isPaused ? [] : incidents,
          status: isPaused ? ('paused' as const) : ('ok' as const),
          trafficKnown: !isPaused,
        };
      }
      const entry = this.cache.stops[block.monitoringRef],
        traffic = this.cache.traffic[block.lineRef];
      const fresh =
        entry && now.getTime() - entry.at < Math.max(300000, effective.pollSeconds * 2500);
      const trafficKnown = !!traffic && !traffic.error && now.getTime() - traffic.at < 1800000;
      const departures = fresh
        ? entry.data
            .filter(
              (d) =>
                d.lineRef === block.lineRef &&
                Date.parse(d.time) >= now.getTime() - 30000 &&
                (block.directionRef
                  ? d.directionRef === block.directionRef
                  : d.destinationRef === block.destinationRef),
            )
            .slice(0, Math.max(effective.richCount, effective.minimalCount))
        : [];
      const incidents = trafficKnown
        ? traffic.data.filter(
            (i) =>
              (!i.starts || Date.parse(i.starts) <= now.getTime()) &&
              (!i.ends || Date.parse(i.ends) > now.getTime()),
          )
        : [];
      const status = isPaused
        ? 'paused'
        : !this.configured(block)
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
      return {
        block,
        effective,
        lineAppearance,
        departures: isPaused ? [] : departures,
        incidents: isPaused ? [] : incidents,
        status,
        trafficKnown: !isPaused && trafficKnown,
      };
    });
    return {
      mode: this.mode,
      now: now.toISOString(),
      paused,
      refreshSeconds: refreshDelay(config, now),
      config,
      blocks,
    };
  }
  diagnostics() {
    return {
      mode: this.mode,
      budget: this.budget.counts(),
      error: this.error,
      stops: Object.entries(this.cache.stops).map(([ref, e]) => ({
        ref,
        at: e.at,
        next: e.next,
        error: e.error,
      })),
      traffic: Object.entries(this.cache.traffic).map(([ref, e]) => ({
        ref,
        at: e.at,
        next: e.next,
        error: e.error,
      })),
    };
  }
}
