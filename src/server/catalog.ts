import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CatalogLine, CatalogPlace } from '../shared/model.js';
export type CatalogData = {
  source: string;
  importedAt?: string;
  rowCount: number;
  lines: CatalogLine[];
  stops: Omit<CatalogPlace, 'lines'>[];
};
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export class Catalog {
  private lineIndex: Map<string, CatalogLine>;
  private stopIndex: Map<string, Omit<CatalogPlace, 'lines'>>;
  private searchable: { stop: Omit<CatalogPlace, 'lines'>; name: string; search: string }[];
  constructor(readonly data: CatalogData) {
    this.lineIndex = new Map(data.lines.map((line) => [line.ref, line]));
    this.stopIndex = new Map(data.stops.map((stop) => [stop.monitoringRef, stop]));
    this.searchable = data.stops.map((stop) => ({
      stop,
      name: normalize(stop.label),
      search: normalize(
        `${stop.label} ${stop.city || ''} ${stop.monitoringRef} ${stop.lineRefs?.map((ref) => this.lineIndex.get(ref)?.label || ref).join(' ')}`,
      ),
    }));
  }
  line(ref: string) {
    return this.lineIndex.get(ref);
  }
  lines(ref: string) {
    return (this.stopIndex.get(ref)?.lineRefs || []).flatMap((key) => {
      const line = this.lineIndex.get(key);
      return line ? [line] : [];
    });
  }
  search(query: string): CatalogPlace[] {
    const q = normalize(query);
    if (q.length < 2) return [];
    const terms = q.split(' ');
    return this.searchable
      .filter((row) => terms.every((term) => row.search.includes(term)))
      .map((row) => ({
        row,
        rank: row.name === q ? 0 : row.name.startsWith(q) ? 1 : row.name.includes(q) ? 2 : 3,
      }))
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.row.stop.label.localeCompare(b.row.stop.label, 'fr') ||
          a.row.stop.monitoringRef.localeCompare(b.row.stop.monitoringRef),
      )
      .slice(0, 20)
      .map(({ row }) => ({ ...row.stop, lines: this.lines(row.stop.monitoringRef) }));
  }
}
let loaded: Promise<Catalog> | undefined;
export function loadCatalog() {
  return (loaded ??= Promise.all([
    readFile(resolve('resources/catalog.json'), 'utf8'),
    readFile(resolve('resources/line-colors.json'), 'utf8'),
  ]).then(([text, appearance]) => {
    const data = JSON.parse(text) as CatalogData;
    const { colors } = JSON.parse(appearance) as {
      colors: Record<string, { color: string; textColor?: string }>;
    };
    return new Catalog({
      ...data,
      lines: data.lines.map((line) => ({ ...line, ...colors[line.ref] })),
    });
  }));
}
