import type { Departure, Discovery, Incident } from '../shared/model.js';
import type { Budget } from './storage.js';
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
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const iso = (v: unknown) => {
  const s = text(v);
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : undefined;
};
export function parseDepartures(payload: unknown): Departure[] {
  const delivery = obj(obj(obj(payload).Siri).ServiceDelivery);
  const deliveries = list(delivery.StopMonitoringDelivery);
  if (!deliveries.length) throw new Error('Réponse PRIM : StopMonitoringDelivery manquant.');
  const result: Departure[] = [];
  for (const raw of deliveries) {
    const d = obj(raw);
    if (d.Status === false || d.ErrorCondition)
      throw new Error('PRIM ne peut pas fournir les passages de cet arrêt.');
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
export function parseIncidents(payload: unknown): Incident[] {
  const delivery = obj(obj(obj(payload).Siri).ServiceDelivery);
  const deliveries = list(delivery.GeneralMessageDelivery);
  if (!deliveries.length) throw new Error('Réponse PRIM : GeneralMessageDelivery manquant.');
  const incidents: Incident[] = [];
  for (const raw of deliveries) {
    const d = obj(raw);
    if (d.Status === false || d.ErrorCondition)
      throw new Error('Informations trafic indisponibles.');
    for (const item of list(d.InfoMessage)) {
      const m = obj(item),
        content = obj(m.Content);
      const messages = list(content.Message).map(obj);
      const full =
        messages.find((msg) => text(msg.MessageType) === 'TEXT_ONLY') ||
        messages.find((msg) => text(msg.MessageType) === 'LONG_MESSAGE') ||
        messages[0];
      const short = messages.find((msg) => text(msg.MessageType) === 'SHORT_MESSAGE');
      const body = plain(full?.MessageText);
      if (!body) continue;
      const id = text(m.ItemIdentifier) || text(m.InfoMessageIdentifier) || body;
      incidents.push({
        id,
        title: plain(short?.MessageText) || 'Perturbation en cours',
        text: body,
        lineRefs: list(content.LineRef).map(text).filter(Boolean),
        starts: iso(content.StartTime),
        ends: iso(m.ValidUntilTime),
      });
    }
  }
  return [...new Map(incidents.map((i) => [i.id, i])).values()];
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
  request(path: string, params: Record<string, string>, automatic = true): Promise<unknown> {
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        if (Date.now() < (this.nextAllowed.get(path) ?? 0))
          throw new Error('PRIM demande une attente avant le prochain appel.');
        const spacing = 250 - (Date.now() - this.lastRequest);
        if (spacing > 0) await new Promise((resolve) => setTimeout(resolve, spacing));
        if (!this.key.trim() || !this.canCall())
          throw new Error('Appels PRIM suspendus : clé absente ou plage inactive.');
        this.lastRequest = Date.now();
        await this.budget.reserve(path, automatic);
        const url = new URL(`https://prim.iledefrance-mobilites.fr/marketplace/${path}`);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        console.log(`[PRIM] ${path} — ${JSON.stringify(params)}`);
        const response = await fetch(url, {
          headers: {
            apiKey: this.key,
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          signal: AbortSignal.timeout(12000),
        });
        console.log(`[PRIM] ${path} — HTTP ${response.status}`);

        if (!response.ok) {
          if (response.status === 429) {
            const retry = Number(response.headers.get('retry-after'));
            this.nextAllowed.set(
              path,
              Date.now() + Math.max(60000, Number.isFinite(retry) ? retry * 1000 : 60000),
            );
            console.error(
              `[PRIM] Rate limité — prochain appel dans ${Math.max(60, Number.isFinite(retry) ? retry : 60)}s`,
            );
          }
          throw new Error(
            `PRIM : HTTP ${response.status}. Vérifiez la clé, les droits et les identifiants dans l’administration.`,
          );
        }
        return response.json() as Promise<unknown>;
      });
    this.queue = work;
    return work;
  }
}
