import { z } from 'zod';
import { ConfigError } from '../shared/model.js';

/** Error whose message is safe to show to the client, with its HTTP status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** PRIM answered with an error, an unexpected payload, or could not be reached. */
export class UpstreamError extends HttpError {
  constructor(message: string) {
    super(502, message);
  }
}

/** A local rule (budget, night pause, rate limit) prevents the PRIM call. */
export class UnavailableError extends HttpError {
  constructor(message: string) {
    super(503, message);
  }
}

/** Maps any thrown value to the status and message returned by the API. */
export function toHttpError(error: unknown): { status: number; message: string } {
  if (error instanceof z.ZodError)
    return {
      status: 400,
      message: error.issues
        .map((i) => (i.path.length ? `${i.path.join('.')} : ${i.message}` : i.message))
        .join(' · '),
    };
  if (error instanceof ConfigError) return { status: 400, message: error.message };
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  // express.json() reports malformed or oversized bodies as exposable 4xx errors.
  const http = error as { status?: unknown; expose?: unknown; message?: unknown };
  if (
    error instanceof Error &&
    http.expose === true &&
    typeof http.status === 'number' &&
    http.status >= 400 &&
    http.status < 500
  )
    return { status: http.status, message: error.message };
  // Network failures and timeouts from fetch() reach PRIM, not the client.
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return { status: 504, message: 'PRIM ne répond pas. Réessayez plus tard.' };
  if (error instanceof TypeError && error.message === 'fetch failed')
    return { status: 502, message: 'PRIM est injoignable. Réessayez plus tard.' };
  return { status: 500, message: 'Erreur interne du serveur. Consultez les journaux.' };
}
