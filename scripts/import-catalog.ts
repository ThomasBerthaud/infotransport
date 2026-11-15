import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
const rowSchema = z.object({
  id: z.string().regex(/^IDFM:C\d+$/),
  shortname: z.string(),
  route_long_name: z.string(),
  stop_id: z.string().regex(/^IDFM:(?:monomodalStopPlace:)?\d+$/),
  stop_name: z.string(),
  nom_commune: z.string().nullish(),
  mode: z.string(),
  operatorname: z.string().nullish(),
});
const source = process.argv[2];
if (!source) throw new Error('Usage : npm run catalog:import -- chemin/arrets-lignes.json');
const rows = z.array(rowSchema).parse(JSON.parse(await readFile(resolve(source), 'utf8')));
const lines = new Map<
  string,
  { ref: string; label: string; name: string; mode: string; operator: string }
>();
const stops = new Map<
  string,
  { label: string; monitoringRef: string; city: string; mode: string; lineRefs: string[] }
>();
for (const row of rows) {
  const ref = `STIF:Line::${row.id.slice(5)}:`;
  lines.set(ref, {
    ref,
    label: row.shortname || row.route_long_name,
    name: row.route_long_name,
    mode: row.mode,
    operator: row.operatorname || '',
  });
  const id = row.stop_id.split(':').at(-1)!;
  const monitoringRef = row.stop_id.includes('monomodalStopPlace:')
    ? `STIF:StopArea:SP:${id}:`
    : `STIF:StopPoint:Q:${id}:`;
  let stop = stops.get(monitoringRef);
  if (!stop) {
    stop = {
      label: row.stop_name,
      monitoringRef,
      city: row.nom_commune || '',
      mode: row.mode,
      lineRefs: [],
    };
    stops.set(monitoringRef, stop);
  }
  if (!stop.lineRefs.includes(ref)) stop.lineRefs.push(ref);
}
await mkdir('resources', { recursive: true });
await writeFile(
  'resources/catalog.json',
  JSON.stringify({
    source: basename(source),
    importedAt: new Date().toISOString(),
    rowCount: rows.length,
    lines: [...lines.values()],
    stops: [...stops.values()],
  }) + '\n',
);
console.log(`${rows.length} associations importées : ${stops.size} arrêts, ${lines.size} lignes.`);
