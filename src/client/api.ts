/** The server could not be reached, or something other than the server answered. */
export class OfflineError extends Error {
  override name = 'OfflineError';
  constructor() {
    super('Le serveur InfoTransport est injoignable.');
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new OfflineError();
  }
  // A captive portal, a proxy error page or a login redirect is not an API answer.
  if (
    response.redirected ||
    response.type === 'opaque' ||
    response.type === 'opaqueredirect' ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    throw new OfflineError();
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      (body as { error?: string } | undefined)?.error || `Erreur HTTP ${response.status}`,
    );
  return body as T;
}
