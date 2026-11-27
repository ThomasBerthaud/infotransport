import { formatParis, parisDay } from '../shared/paris-time.js';
const DAY_MS = 86_400_000;
/** Beyond this, IDFM's end date is a placeholder rather than a planned end. */
const OPEN_ENDED_MS = 180 * DAY_MS;
const clock = (date: Date) => formatParis(date, { hour: '2-digit', minute: '2-digit' });

/**
 * When a disruption shown as in progress is expected to end, in Paris time:
 * « Jusqu’à 23:00 », « Jusqu’à demain 02:13 », « Jusqu’au jeu. 27 nov., 03:00 ».
 */
export function incidentUntil(ends: string | undefined, now: Date): string {
  const end = ends ? new Date(ends) : undefined;
  if (!end || !Number.isFinite(end.getTime())) return 'En cours';
  if (end.getTime() - now.getTime() > OPEN_ENDED_MS) return 'Jusqu’à nouvel ordre';
  const days = Math.round((parisDay(end.getTime()) - parisDay(now.getTime())) / DAY_MS);
  if (days <= 0) return `Jusqu’à ${clock(end)}`;
  if (days === 1) return `Jusqu’à demain ${clock(end)}`;
  const date = formatParis(end, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `Jusqu’au ${date}, ${clock(end)}`;
}
