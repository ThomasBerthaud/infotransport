export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      (body as { error?: string } | undefined)?.error || `Erreur HTTP ${response.status}`,
    );
  return body as T;
}
