import type { Block, CatalogLine, Departure, Discovery, Incident } from '../shared/model.js';

// Fictional data shown without a PRIM key. Nothing here is ever sent upstream.

const MINUTE_MS = 60_000;

const demoDirectionNames: Record<string, [string, string]> = {
  'STIF:Line::C01740:': ['Paris Saint-Lazare', 'Versailles Rive Droite'],
  'STIF:Line::C01741:': ['La Défense', 'La Verrière'],
};

// Keyed by line: each fictional notice describes one line and must stay on it,
// whatever the order of the blocks.
const demoIncidentTexts: Record<string, Pick<Incident, 'id' | 'title' | 'text'>> = {
  'STIF:Line::C01740:': {
    id: 'demo-incident',
    title: 'Ralentissements vers Paris Saint-Lazare',
    text: 'Exemple fictif : un incident de signalisation entraîne des retards de quelques minutes entre La Défense et Paris Saint-Lazare. Les trains continuent de circuler. Ce message illustre l’affichage des informations complètes en mode démonstration.',
  },
  'STIF:Line::C01741:': {
    id: 'demo-incident-u',
    title: 'Desserte adaptée vers La Verrière',
    text: 'Exemple fictif : des travaux entraînent une adaptation de la desserte sur la ligne U. Vérifiez les horaires annoncés avant de rejoindre la gare. Les trains en direction de La Verrière restent accessibles. Ce message sert à tester la navigation entre plusieurs informations et ne décrit pas un incident réel.',
  },
};

/** Regular fictional departures; the first block shows one delayed train. */
export function demoDepartures(block: Block, index: number, now: Date, count: number): Departure[] {
  const base = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  const first = (index ? 6 : 3) * MINUTE_MS;
  const headway = (index ? 14 : 8) * MINUTE_MS;
  return Array.from({ length: count }, (_, i) => {
    const time = base + first + i * headway;
    const delay = index === 0 && i === 1 ? 3 * MINUTE_MS : 0;
    return {
      id: `demo-${block.id}-${i}`,
      time: new Date(time).toISOString(),
      aimedTime: new Date(time - delay).toISOString(),
      destination: block.direction,
      lineRef: block.lineRef,
      cancelled: false,
      realtime: true,
      platform: index ? 'B' : 'A',
      mission: index ? 'DEFI' : 'PASA',
    };
  });
}

/** The fictional incident of the block's line, if that line has one. */
export function demoIncidents(block: Block): Incident[] {
  const incident = demoIncidentTexts[block.lineRef];
  return incident ? [{ ...incident, lineRefs: [block.lineRef] }] : [];
}

/** Two fictional directions per catalog line, flagged so live collection refuses them. */
export function demoDiscovery(lines: CatalogLine[]): Discovery {
  return {
    lines: lines.map((line) => ({ ref: line.ref, label: line.label })),
    directions: lines.flatMap((line) =>
      (
        demoDirectionNames[line.ref] ?? [
          'Sens aller · démonstration',
          'Sens retour · démonstration',
        ]
      ).map((name, index) => ({
        lineRef: line.ref,
        name,
        directionRef: `DEMO:direction:${line.ref}:${index}`,
        destinationRef: `DEMO:destination:${line.ref}:${index}`,
      })),
    ),
  };
}
