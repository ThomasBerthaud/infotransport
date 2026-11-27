// Imports scheduled timetables for the configured blocks from an unzipped IDFM GTFS folder.
//   npm run timetables:import -- chemin/vers/gtfs
//   docker compose exec infotransport node dist/server/server/import-timetables.js /data/gtfs
// Reads config.json and cache.json from DATA_DIR and writes DATA_DIR/timetables.json.
// The running server picks the new file up without restarting.
import { stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { validateConfig } from '../shared/model.js';
import { formatParis } from '../shared/paris-time.js';
import { Store } from './storage.js';
import { importTimetables, TIMETABLES_FILE, type KnownDepartures } from './timetables.js';

const source = process.argv[2];
if (!source) {
  console.error('Usage : npm run timetables:import -- dossier-gtfs-décompressé');
  process.exit(1);
}
const dir = resolve(source);
if (!(await stat(dir).catch(() => undefined))?.isDirectory()) {
  console.error(
    `${dir} n’est pas un dossier. Décompressez d’abord le GTFS, par exemple :\n` +
      '  unzip -o IDFM-gtfs.zip calendar.txt calendar_dates.txt trips.txt stop_times.txt -d gtfs',
  );
  process.exit(1);
}
const store = new Store(resolve(process.env.DATA_DIR || 'data'));
const stored = await store.read<unknown>('config.json', undefined);
if (stored === undefined) {
  console.error(`Aucune configuration dans ${store.directory} : enregistrez d’abord vos blocs.`);
  process.exit(1);
}
const config = validateConfig(stored);
const cache = await store.read<{ stops?: KnownDepartures }>('cache.json', {});
const started = Date.now();
const result = await importTimetables({
  dir,
  config,
  known: cache.stops ?? {},
  source: basename(dir),
});
const { uncovered, ...file } = result;
await store.write(TIMETABLES_FILE, file);
const total = file.entries.reduce((sum, e) => sum + e.departures.length, 0);
console.log(
  `${total} départs théoriques importés pour ${file.entries.length - uncovered.length}/${file.entries.length} blocs, jusqu’au ${formatParis(file.validUntil)} (${Math.round((Date.now() - started) / 1000)} s).`,
);
for (const label of uncovered) console.warn(`Aucun départ trouvé : ${label}`);
