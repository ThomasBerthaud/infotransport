import { primQuotas } from '../shared/model.js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export class Store {
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly directory: string) {}
  async read<T>(name: string, fallback: T): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    try {
      return JSON.parse(await readFile(join(this.directory, name), 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw new Error(`Fichier ${name} illisible. Vérifiez le volume avant de redémarrer.`);
    }
  }
  write(name: string, data: unknown) {
    const content = JSON.stringify(data, null, 2);
    const work = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const tmp = join(this.directory, `${name}.tmp`);
      await writeFile(tmp, content, { mode: 0o600 });
      await rename(tmp, join(this.directory, name));
    });
    this.queue = work.catch(() => {});
    return work;
  }
}
export type BudgetState = { reservations: { at: number; api: string; automatic: boolean }[] };
export class Budget {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private store: Store,
    private state: BudgetState,
  ) {
    if (
      !Array.isArray(state.reservations) ||
      state.reservations.some(
        (r) =>
          !Number.isFinite(r.at) || typeof r.api !== 'string' || typeof r.automatic !== 'boolean',
      )
    )
      throw new Error('Compteur d’appels corrompu.');
  }
  counts(now = Date.now()) {
    // Sliding 24h window: never assume the provider's reset timezone.
    const recent = this.state.reservations.filter((r) => r.at > now - 86400000);
    const apis = primQuotas.map((quota) => {
      const calls = recent.filter((r) => r.api === quota.api);
      return { ...quota, used: calls.length, automatic: calls.filter((r) => r.automatic).length };
    });
    return {
      apis,
      used: recent.length,
      automatic: recent.filter((r) => r.automatic).length,
      limit: apis.reduce((sum, api) => sum + api.limit, 0),
      automaticLimit: apis.reduce((sum, api) => sum + api.automaticLimit, 0),
      window: '24 heures glissantes',
    };
  }
  reserve(api: string, automatic = true, now = Date.now()) {
    const task = this.queue.then(async () => {
      const counts = this.counts(now).apis.find((quota) => quota.api === api);
      if (!counts) throw new Error(`API PRIM sans quota configuré : ${api}.`);
      if (counts.used >= counts.limit || (automatic && counts.automatic >= counts.automaticLimit))
        throw new Error(
          `Budget PRIM atteint pour ${counts.label}. Les dernières données restent en cache.`,
        );
      const reservations = [
        ...this.state.reservations.filter((r) => r.at > now - 86400000),
        { at: now, api, automatic },
      ];
      const next = { reservations };
      await this.store.write('budget.json', next);
      this.state = next;
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
