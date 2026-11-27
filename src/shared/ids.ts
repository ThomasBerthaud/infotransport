import { z } from 'zod';

// IDFM identifiers. SIRI (PRIM) uses `STIF:StopPoint:Q:[ArRId]:` for bus, tram and metro
// stops, `STIF:StopArea:SP:[ZdAId]:` for RER and Transilien stops and `STIF:Line::CXXXXX:`
// for lines. The GTFS feed uses `IDFM:[ArRId]`, `IDFM:monomodalStopPlace:[ZdAId]` and
// `IDFM:CXXXXX`; Navitia uses `line:IDFM:CXXXXX`.

/** SIRI stop reference: a quay (`STIF:StopPoint:Q:…:`) or a stop area (`STIF:StopArea:SP:…:`). */
export const STOP_REF = /^STIF:Stop(?:Area:SP|Point:Q):\d+:$/;
/** SIRI line reference, `STIF:Line::C01740:`. */
export const LINE_REF = /^STIF:Line::C\d+:$/;
/** Demo stop reference, `DEMO:la-defense`. */
export const DEMO_REF = /^DEMO:[\w-]+$/;

const QUAY_REF = /^STIF:StopPoint:Q:(\d+):$/;
const AREA_REF = /^STIF:StopArea:SP:(\d+):$/;
const LINE_CODE = /^STIF:Line::(C\d+):$/;
const NAVITIA_LINE = /^line:IDFM:(C\d+)$/;

export const isStopRef = (ref: string) => STOP_REF.test(ref);
export const isLineRef = (ref: string) => LINE_REF.test(ref);

export const stopRefSchema = z.string().regex(STOP_REF);
export const lineRefSchema = z.string().regex(LINE_REF);
/** Stop a discovery may target: a real SIRI stop or a demo stop. */
export const discoverableRefSchema = z
  .string()
  .refine((ref) => isStopRef(ref) || DEMO_REF.test(ref), 'Identifiant d’arrêt invalide.');

/** GTFS stop id of a SIRI stop reference. */
export function gtfsStopId(siriRef: string): string | undefined {
  const quay = QUAY_REF.exec(siriRef)?.[1];
  if (quay) return `IDFM:${quay}`;
  const area = AREA_REF.exec(siriRef)?.[1];
  return area ? `IDFM:monomodalStopPlace:${area}` : undefined;
}
/** GTFS route id of a SIRI line reference. */
export function gtfsRouteId(lineRef: string): string | undefined {
  const code = LINE_CODE.exec(lineRef)?.[1];
  return code ? `IDFM:${code}` : undefined;
}
/** PRIM Navitia path of the traffic reports of a SIRI line. */
export function lineReportsPath(lineRef: string): string {
  const code = LINE_CODE.exec(lineRef)?.[1];
  if (!code) throw new Error(`Identifiant de ligne invalide : ${lineRef}.`);
  return `v2/navitia/line_reports/lines/line:IDFM:${code}/line_reports`;
}
/** SIRI line reference of a Navitia line id (`line:IDFM:C01740` → `STIF:Line::C01740:`). */
export function siriLineRef(navitiaId: string): string | undefined {
  const code = NAVITIA_LINE.exec(navitiaId)?.[1];
  return code ? `STIF:Line::${code}:` : undefined;
}
