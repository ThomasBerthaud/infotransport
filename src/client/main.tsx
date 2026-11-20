import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@fontsource-variable/manrope';
import './style.css';
import { Icon } from '../components/Icon.js';
import { DashboardView } from './view.js';
const Admin = lazy(() => import('./admin.js').then((module) => ({ default: module.Admin })));
import { api } from './api.js';
import type { Dashboard } from '../shared/model.js';
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
    queryFn: ({ signal }) =>
      api<Dashboard>(admin ? '/api/dashboard?preview=1' : '/api/dashboard', { signal }),
    refetchInterval: (q) => (q.state.data ? q.state.data.refreshSeconds * 1000 : 30000),
  });
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
            <div>
              <strong>Impossible de charger le tableau</strong>
              <p>{query.error.message}</p>
            </div>
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
              {admin ? (
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
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
