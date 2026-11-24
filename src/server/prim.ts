import type { Departure, Discovery, Incident } from '../shared/model.js';
import type { Budget } from './storage.js';
import { UnavailableError, UpstreamError } from './errors.js';
import { log } from './log.js';
const PRIM_BASE_URL = 'https://prim.iledefrance-mobilites.fr/marketplace/';
/** Minimum spacing between two PRIM calls, whatever the API. */
const REQUEST_SPACING_MS = 250;
const REQUEST_TIMEOUT_MS = 12_000;
/** Minimum wait after an HTTP 429, even when Retry-After is shorter or absent. */
const MIN_RATE_LIMIT_WAIT_S = 60;
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const list = (v: unknown): unknown[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return text(v[0]);
  return typeof obj(v).value === 'string' ? (obj(v).value as string) : '';
}
const plain = (v: unknown) =>
  text(v)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    // Paragraph boundaries become blank lines instead of gluing sentences.
    .replace(/<\/p>\s*(?=\S)/gi, '\n\n')
    // Only real tags: IDFM titles use `<>` and `<->` between stations.
    .replace(/<\/?[a-z][^<>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:#39|apos|rsquo);/g, '’')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
const iso = (v: unknown) => {
  const s = text(v);
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : undefined;
};
export function parseDepartures(payload: unknown): Departure[] {
  const delivery = obj(obj(obj(payload).Siri).ServiceDelivery);
  const deliveries = list(delivery.StopMonitoringDelivery);
  if (!deliveries.length)
    throw new UpstreamError('Réponse PRIM : StopMonitoringDelivery manquant.');
  const result: Departure[] = [];
  for (const raw of deliveries) {
    const d = obj(raw);
    if (d.Status === false || d.ErrorCondition)
      throw new UpstreamError('PRIM ne peut pas fournir les passages de cet arrêt.');
    for (const entry of list(d.MonitoredStopVisit)) {
      const visit = obj(entry),
        journey = obj(visit.MonitoredVehicleJourney),
        call = obj(journey.MonitoredCall);
      const expected = iso(call.ExpectedDepartureTime) || iso(call.ExpectedArrivalTime);
      const aimed = iso(call.AimedDepartureTime) || iso(call.AimedArrivalTime);
      const time = expected || aimed;
      if (!time) continue;
      const destination = text(call.DestinationDisplay) || text(journey.DestinationName);
      result.push({
        id:
          text(obj(journey.FramedVehicleJourneyRef).DatedVehicleJourneyRef) ||
          `${text(journey.LineRef)}-${time}-${destination}`,
        time,
        aimedTime: aimed,
        destination,
        lineRef: text(journey.LineRef),
        destinationRef: text(journey.DestinationRef),
        directionRef: text(journey.DirectionRef),
        cancelled:
          ['cancelled', 'canceled'].includes(text(call.DepartureStatus)) ||
          ['cancelled', 'canceled'].includes(text(call.ArrivalStatus)),
        realtime: !!expected,
        platform: text(call.DeparturePlatformName) || undefined,
        mission: text(journey.VehicleJourneyName) || undefined,
      });
    }
  }
  return [...new Map(result.map((d) => [`${d.id}-${d.time}`, d])).values()].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  );
}
// IDFM writes sections as `A <> B` or `A <-> B`; fonts may turn `<-` into an arrow.
const between = (s: string) => s.replace(/[ \t]*<-?>[ \t]*/g, ' – ');
// The line badge already names the line, so drop IDFM's `Ligne U :` / `RER A :` prefix
// and use a typographic dash between stations.
export function tidyTitle(title: string) {
  const tidy = between(title)
    .replace(/^(?:ligne|rer|métro|metro|tram(?:way)?|train|bus)\s+[\p{L}\d]+\s*:\s*/iu, '')
    .replace(/\s+-\s+/g, ' – ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return tidy || title.trim();
}
// IDFM Navitia uses `line:IDFM:C01740` where SIRI uses `STIF:Line::C01740:`.
export function lineReportsPath(lineRef: string) {
  const code = /^STIF:Line::(C\d+):$/.exec(lineRef)?.[1];
  if (!code) throw new Error(`Identifiant de ligne invalide : ${lineRef}.`);
  return `v2/navitia/line_reports/lines/line:IDFM:${code}/line_reports`;
}
const stifLine = (id: string) => {
  const code = /^line:IDFM:(C\d+)$/.exec(id)?.[1];
  return code ? `STIF:Line::${code}:` : undefined;
};
/**
 * Lines a Navitia disruption actually affects, read from its impacted objects:
 * whole lines, line sections, routes and impacted sections. Never the queried line
 * by default: `line_reports` also returns disruptions of objects shared with other
 * lines (stations, sections), which must not be shown on the queried line.
 */
function impactedLines(d: Obj): string[] {
  const ids: unknown[] = [];
  for (const raw of list(d.impacted_objects)) {
    const impacted = obj(raw);
    const o = obj(impacted.pt_object);
    const type = text(o.embedded_type);
    if (type === 'line') ids.push(o.id);
    ids.push(obj(obj(o.line_section).line).id, obj(obj(o.route).line).id);
    ids.push(...list(obj(o.stop_area).lines).map((l) => obj(l).id));
    ids.push(obj(obj(obj(o.stop_point).route).line).id);
    for (const section of [impacted.impacted_section, impacted.impacted_rail_section])
      ids.push(...list(obj(section).routes).map((r) => obj(obj(r).line).id));
  }
  return [...new Set(ids.map((id) => stifLine(text(id))).filter((ref): ref is string => !!ref))];
}
/** Disruption ids the queried line's report links to (the line itself or its objects). */
function linkedDisruptions(payload: Obj, lineRef: string): Set<string> {
  const ids = new Set<string>();
  for (const raw of list(payload.line_reports)) {
    const report = obj(raw);
    const line = obj(report.line);
    if (stifLine(text(line.id)) !== lineRef) continue;
    for (const holder of [line, ...list(report.pt_objects).map(obj)])
      for (const link of list(holder.links).map(obj))
        if (text(link.type) === 'disruption' || text(link.rel) === 'disruptions')
          ids.add(text(link.id));
  }
  ids.delete('');
  return ids;
}
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
// Navitia dates are local wall-clock times (`20261118T060000`), Europe/Paris for IDFM.
export function navitiaDate(v: unknown): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(text(v));
  if (!m) return iso(v);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const t = wall - parisOffset(wall - parisOffset(wall));
  return new Date(t).toISOString();
}
export function parseLineReports(payload: unknown, lineRef: string, now = Date.now()): Incident[] {
  const p = obj(payload);
  if (!Array.isArray(p.disruptions)) {
    const message = text(obj(p.error).message);
    if (message || !Array.isArray(p.line_reports))
      throw new UpstreamError(
        message
          ? `Informations trafic indisponibles : ${message}`
          : 'Réponse PRIM : disruptions manquant.',
      );
    return [];
  }
  type Period = { starts?: string; ends?: string };
  const at = (v?: string) => (v ? Date.parse(v) : NaN);
  // The period in force now, else the next one, else the first known.
  const pick = (periods: Period[]) =>
    periods.find((x) => !(at(x.starts) > now) && !(at(x.ends) <= now)) ||
    periods.filter((x) => at(x.starts) > now).sort((a, b) => at(a.starts) - at(b.starts))[0] ||
    periods[0];
  // IDFM splits one notice into several disruptions with identical texts and
  // different periods: merge them so the panel shows each notice once.
  const notices = new Map<string, { incident: Incident; periods: Period[] }>();
  const linked = linkedDisruptions(p, lineRef);
  for (const raw of p.disruptions) {
    const d = obj(raw);
    if (text(d.status) === 'past') continue;
    // Elevator outages are reported per station along the whole line (often
    // hundreds) and are not service disruptions for the tracked journey.
    if (list(d.tags).map(text).includes('Ascenseur')) continue;
    const messages = list(d.messages).map(obj);
    const has = (m: Obj, type: string) => list(obj(m.channel).types).map(text).includes(type);
    const titleMessage = messages.find((m) => has(m, 'title'));
    const full =
      messages.find((m) => has(m, 'web')) ||
      messages.find((m) => has(m, 'mobile')) ||
      messages
        .filter((m) => m !== titleMessage)
        .sort((a, b) => text(b.text).length - text(a.text).length)[0];
    const heading = tidyTitle(plain(titleMessage?.text));
    const body = between(plain(full?.text)).trim() || heading;
    if (!body) continue;
    const periods = list(d.application_periods)
      .map(obj)
      .map((period) => ({ starts: navitiaDate(period.begin), ends: navitiaDate(period.end) }));
    let lines = impactedLines(d);
    if (!lines.length) {
      // No identifiable line (station, network…): only keep it on the queried
      // line when that line's report explicitly links to it.
      const ids = [d.id, d.disruption_id, d.impact_id].map(text).filter(Boolean);
      if (!ids.some((id) => linked.has(id))) {
        log.debug(`[PRIM] perturbation ${ids[0] || '?'} ignorée : aucune ligne identifiable`);
        continue;
      }
      lines = [lineRef];
    }
    const title = heading || text(d.cause) || 'Perturbation en cours';
    const key = `${title}\n${body}`;
    const known = notices.get(key);
    if (known) {
      known.periods.push(...periods);
      known.incident.lineRefs = [...new Set([...known.incident.lineRefs, ...lines])];
      continue;
    }
    notices.set(key, {
      incident: {
        id: text(d.id) || text(d.impact_id) || text(d.disruption_id) || body,
        title,
        text: body,
        lineRefs: lines,
      },
      periods,
    });
  }
  return [...notices.values()].map(({ incident, periods }) => {
    const period = pick(periods);
    return { ...incident, starts: period?.starts, ends: period?.ends };
  });
}
export function discover(departures: Departure[]): Discovery {
  return {
    lines: [...new Set(departures.map((d) => d.lineRef))].map((ref) => ({ ref, label: ref })),
    directions: [
      ...new Map(
        departures.map((d) => [
          `${d.lineRef}|${d.directionRef}|${d.destinationRef}`,
          {
            lineRef: d.lineRef,
            name: d.destination,
            directionRef: d.directionRef || '',
            destinationRef: d.destinationRef || '',
          },
        ]),
      ).values(),
    ],
  };
}
export class Prim {
  private queue: Promise<unknown> = Promise.resolve();
  private nextAllowed = new Map<string, number>();
  private lastRequest = 0;
  constructor(
    private key: string,
    private budget: Budget,
    private canCall: () => boolean = () => true,
  ) {}
  /** `api` names the quota bucket; `path` defaults to it when the endpoint is static. */
  request(
    api: string,
    params: Record<string, string>,
    automatic = true,
    path: string = api,
  ): Promise<unknown> {
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        if (Date.now() < (this.nextAllowed.get(api) ?? 0))
          throw new UnavailableError('PRIM demande une attente avant le prochain appel.');
        const spacing = REQUEST_SPACING_MS - (Date.now() - this.lastRequest);
        if (spacing > 0) await new Promise((resolve) => setTimeout(resolve, spacing));
        if (!this.key.trim() || !this.canCall())
          throw new UnavailableError('Appels PRIM suspendus : clé absente ou plage inactive.');
        this.lastRequest = Date.now();
        await this.budget.reserve(api, automatic);
        const url = new URL(path, PRIM_BASE_URL);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        log.debug(`[PRIM] ${path} — ${JSON.stringify(params)}`);
        const response = await fetch(url, {
          headers: {
            apiKey: this.key,
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        log.debug(`[PRIM] ${path} — HTTP ${response.status}`);
        if (!response.ok) {
          if (response.status === 429) {
            const retry = Number(response.headers.get('retry-after'));
            const wait = Math.max(MIN_RATE_LIMIT_WAIT_S, Number.isFinite(retry) ? retry : 0);
            this.nextAllowed.set(api, Date.now() + wait * 1000);
            log.warn(`[PRIM] ${path} limité (HTTP 429) — prochain appel dans ${wait} s`);
          }
          throw new UpstreamError(
            `PRIM : HTTP ${response.status}. Vérifiez la clé, les droits et les identifiants dans l’administration.`,
          );
        }
        return response.json() as Promise<unknown>;
      });
    this.queue = work;
    return work;
  }
}
