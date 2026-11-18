const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 } as const;
type Level = keyof typeof levels;

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in levels) return levels[configured as Level];
  // Keep test output readable; production and development default to info.
  return process.env.NODE_ENV === 'test' ? levels.error : levels.info;
}

function write(level: Exclude<Level, 'silent'>, message: string) {
  if (levels[level] < threshold()) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

/** Minimal levelled logger; LOG_LEVEL=debug|info|warn|error|silent. */
export const log = {
  debug: (message: string) => write('debug', message),
  info: (message: string) => write('info', message),
  warn: (message: string) => write('warn', message),
  error: (message: string) => write('error', message),
};
