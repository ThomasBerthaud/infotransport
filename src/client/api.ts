export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  console.log(`[API] ${init?.method || 'GET'} ${path}`);
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  console.log(`[API] ${path} → HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = (body as { error?: string }).error || `Erreur HTTP ${response.status}`;
    console.error(`[API] ${path} — ERREUR : ${message}`);
    throw new Error(message);
  }
  return body as T;
}
