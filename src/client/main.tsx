import React, { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@fontsource-variable/manrope';
import './style.css';
import { Icon } from '../components/Icon.js';
import { DashboardView } from './view.js';
const Admin = lazy(() => import('./admin.js').then((module) => ({ default: module.Admin })));
import { api, OfflineError } from './api.js';
import type { Dashboard } from '../shared/model.js';
import { offlineFallback, remember } from './offline-store.js';
import { registerServiceWorker, useUpdateAvailable } from './pwa.js';
/** While offline, saved departures are recomputed (and the server tried) this often. */
const OFFLINE_REFRESH_MS = 30000;
/** `JJ/MM à HH:MM`, Paris time. */
const savedAt = (value: string) => {
  const date = new Date(value);
  const format = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...options });
  return `${format({ day: '2-digit', month: '2-digit' })} à ${format({ hour: '2-digit', minute: '2-digit' })}`;
};
async function loadDashboard(signal: AbortSignal, admin: boolean): Promise<Dashboard> {
  try {
    if (admin) return await api<Dashboard>('/api/dashboard?preview=1', { signal });
    const dashboard = await api<Dashboard>('/api/dashboard', { signal });
    // Only the rich view's window is saved: the admin preview keeps extra departures.
    void remember(dashboard);
    return dashboard;
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;
    const saved = await offlineFallback(new Date());
    if (saved) return saved;
    throw error;
  }
}
function OfflineBanner({ data }: { data: Dashboard }) {
  if (!data.offline) return null;
  return (
    <output className="offline-banner">
      <strong>Hors connexion</strong>
      <span>
        {data.offline.expired
          ? `Horaires mémorisés le ${savedAt(data.offline.savedAt)}, trop anciens pour être affichés`
          : `Horaires mémorisés le ${savedAt(data.offline.savedAt)}`}
      </span>
      {data.offline.scheduled && <span>Horaires théoriques · sans information temps réel</span>}
    </output>
  );
}
function UpdateBanner() {
  if (!useUpdateAvailable()) return null;
  return (
    <output className="update-banner">
      Nouvelle version disponible.
      <button className="secondary-button" onClick={() => location.reload()}>
        Recharger
      </button>
    </output>
  );
}
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Keep the scheduled wake-up time when connectivity returns during a pause.
      refetchOnReconnect: false,
      staleTime: 30000,
    },
    mutations: {
      retry: false,
    },
  },
});
function App() {
  const admin = location.pathname === '/admin';
  const query = useQuery({
    // The admin preview needs a wider departure window to apply draft settings.
    queryKey: ['dashboard', admin],
    queryFn: ({ signal }) => loadDashboard(signal, admin),
    refetchInterval: (q) =>
      q.state.data && !q.state.data.offline
        ? q.state.data.refreshSeconds * 1000
        : OFFLINE_REFRESH_MS,
  });
  const { refetch } = query;
  const paused = query.data?.paused;
  useEffect(() => {
    // refetchOnReconnect stays off so a pause keeps its wake-up time; outside a pause,
    // ask the server once as soon as the network is back (no PRIM call involved).
    const reconnect = () => {
      if (!paused) void refetch();
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [paused, refetch]);
  return (
    <>
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="InfoTransport, accueil">
          <svg width="27" height="27" viewBox="0 0 28 28" aria-hidden="true">
            <path
              d="M5 22V8h18v14M9 4h10M9 8v8m10-8v8M5 16h18M8 22l-3 4m15-4 3 4"
              stroke="currentColor"
              fill="none"
              strokeWidth="2"
            />
            <circle cx="10" cy="20" r="1.2" />
            <circle cx="18" cy="20" r="1.2" />
          </svg>
          InfoTransport<span className="local-tag">Local</span>
        </a>
        <nav aria-label="Navigation principale">
          <a href="/" aria-current={!admin ? 'page' : undefined}>
            Départs
          </a>
          <a href="/minimal" target="_blank" rel="noreferrer">
            Vue épurée <Icon name="external" size={15} />
          </a>
          <a href="/admin" aria-current={admin ? 'page' : undefined}>
            Réglages
          </a>
        </nav>
      </header>
      <UpdateBanner />
      {query.data && <OfflineBanner data={query.data} />}
      {query.data?.mode === 'demo' && (
        <div className="demo-banner">
          <span className="status-dot" />
          Démonstration · horaires et incidents fictifs<span>Aucune clé PRIM fournie</span>
        </div>
      )}
      <main className="app-main">
        {query.isPending ? (
          <output className="loading-state">Chargement des départs…</output>
        ) : query.error && !query.data ? (
          <div className="error-box" role="alert">
            {query.error instanceof OfflineError ? (
              <div>
                <strong>Hors connexion</strong>
                <p>
                  Le serveur InfoTransport est injoignable et aucun horaire n’a encore été mémorisé
                  sur cet appareil. Ouvrez l’application une fois connecté pour en conserver.
                </p>
              </div>
            ) : (
              <div>
                <strong>Impossible de charger le tableau</strong>
                <p>{query.error.message}</p>
              </div>
            )}
            <button
              className="secondary-button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Réessayer
            </button>
          </div>
        ) : (
          query.data && (
            <>
              {query.error && (
                <div className="error-box refresh-error" role="alert">
                  <div>
                    <strong>Actualisation interrompue</strong>
                    <p>Les dernières données reçues restent affichées.</p>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={query.isFetching}
                    onClick={() => void query.refetch()}
                  >
                    Réessayer
                  </button>
                </div>
              )}
              {admin && query.data.offline ? (
                <div className="error-box" role="alert">
                  <div>
                    <strong>Réglages indisponibles hors connexion</strong>
                    <p>Les réglages sont enregistrés sur le serveur, injoignable pour le moment.</p>
                  </div>
                </div>
              ) : admin ? (
                <Suspense
                  fallback={<output className="loading-state">Chargement des réglages…</output>}
                >
                  <Admin dashboard={query.data} />
                </Suspense>
              ) : (
                <DashboardView data={query.data} />
              )}
            </>
          )
        )}
      </main>
    </>
  );
}
registerServiceWorker();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
