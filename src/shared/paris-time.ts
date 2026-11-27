// Europe/Paris time, shared by the server and the client. IDFM data, schedules and
// every displayed time follow Paris wall-clock time whatever the device time zone.

export const PARIS_TIME_ZONE = 'Europe/Paris';

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
/** Offset of Paris time from UTC at instant `t`, in ms (1 h in winter, 2 h in summer). */
export function parisOffset(t: number): number {
  const parts = Object.fromEntries(
    wallClock.formatToParts(new Date(t)).map((p) => [p.type, Number(p.value)]),
  );
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - t
  );
}
/**
 * Instant of a Paris wall-clock time given as if it were UTC (`Date.UTC(…)` of the local
 * fields). The second pass takes the offset in force at the result, not at `wall`.
 */
export function fromParisWallClock(wall: number): number {
  return wall - parisOffset(wall - parisOffset(wall));
}
/** Paris calendar date of an instant, as `YYYYMMDD`. */
export function parisDate(t: number): string {
  return new Date(t + parisOffset(t)).toISOString().slice(0, 10).replace(/-/g, '');
}
/** UTC midnight of the Paris calendar date of an instant: a day counter for date differences. */
export function parisDay(t: number): number {
  const date = parisDate(t);
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
}

const dayAndTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Paris weekday (1 = Monday … 7 = Sunday) and minute of the day of an instant. */
export function localParts(date: Date): { day: number; minute: number } {
  const parts = dayAndTime.formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: weekdays.indexOf(value('weekday')) + 1,
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  };
}
/** Formats an instant in Paris time, in French unless another locale is given. */
export function formatParis(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  locale = 'fr-FR',
): string {
  return new Date(value).toLocaleString(locale, { ...options, timeZone: PARIS_TIME_ZONE });
}
