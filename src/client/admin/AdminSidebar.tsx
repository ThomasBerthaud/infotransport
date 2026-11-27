import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiBudget, Config, Dashboard } from '../../shared/model.js';
import { estimatedCallsByApi, primQuotas } from '../../shared/model.js';
import { formatParis } from '../../shared/paris-time.js';
import { budgetLevel } from './blocks.js';

export type Diagnostic = {
  mode: string;
  budget: { apis: ApiBudget[]; window: string };
  error?: string;
  configError?: string;
  catalog?: { source: string; importedAt?: string; rowCount: number };
  timetables?: {
    state: 'missing' | 'invalid' | 'expired' | 'ok';
    importedAt?: string;
    validUntil?: string;
    uncovered: string[];
    error?: string;
  };
  stops: { ref: string; at: number; next: number; error?: string }[];
  traffic: { ref: string; at: number; next: number; error?: string }[];
};

const consumptionLabel = {
  unknown: 'Consommation inconnue',
  exhausted: 'Quota atteint',
  critical: 'Quota presque atteint',
  warning: 'Consommation élevée',
  normal: 'utilisés',
} as const;

const shownDate = (value: string | number, withTime = true) =>
  formatParis(value, withTime ? {} : { dateStyle: 'long' });

function TimetablesStatus({ timetables }: { timetables: NonNullable<Diagnostic['timetables']> }) {
  const problem =
    timetables.state === 'missing'
      ? 'Aucun horaire théorique importé : hors connexion, seuls les horaires mémorisés seront affichés.'
      : timetables.state === 'invalid'
        ? timetables.error
        : timetables.state === 'expired'
          ? `Horaires théoriques expirés depuis le ${shownDate(timetables.validUntil!)}. Relancez l’import.`
          : undefined;
  return (
    <div className="timetables-status">
      <h3>Horaires théoriques hors connexion</h3>
      {problem ? (
        <p className="field-error">{problem}</p>
      ) : (
        <p className="field-help">
          Importés le {shownDate(timetables.importedAt!)}, valables jusqu’au{' '}
          {shownDate(timetables.validUntil!)}.
        </p>
      )}
      {timetables.state !== 'missing' && timetables.uncovered.length > 0 && (
        <>
          <p className="field-error">Blocs sans horaire théorique, relancez l’import :</p>
          <ul>
            {timetables.uncovered.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AdminSidebar({
  dashboard,
  draft,
  status,
}: {
  dashboard: Dashboard;
  draft: Config;
  status: UseQueryResult<Diagnostic>;
}) {
  const estimates = estimatedCallsByApi(draft);
  return (
    <aside className="admin-sidebar">
      <section>
        <div className="section-heading">
          <h2>Budget PRIM</h2>
        </div>
        <p>Quotas indépendants · suivi local sur 24 heures glissantes</p>
        {primQuotas.map((quota) => {
          const used = status.data?.budget.apis.find((item) => item.api === quota.api)?.used;
          const percent = used === undefined ? undefined : Math.round((used / quota.limit) * 100);
          const level = budgetLevel(used, quota.limit);
          return (
            <div className="api-budget" data-api={quota.api} data-level={level} key={quota.api}>
              <h3>{quota.label}</h3>
              <p className="budget-value">
                {used ?? '—'}
                <span> / {quota.limit.toLocaleString('fr-FR')}</span>
              </p>
              <meter
                className="budget-track"
                min={0}
                max={quota.limit}
                value={used ?? 0}
                aria-label={quota.label}
                aria-valuetext={
                  used === undefined ? 'Compteur indisponible' : `${used} appels sur ${quota.limit}`
                }
              />
              <p className="budget-consumption">
                <strong>
                  {percent === undefined ? '—' : `${percent} %`} {consumptionLabel[level]}
                </strong>
                {used !== undefined && (
                  <span>{Math.max(0, quota.limit - used).toLocaleString('fr-FR')} restants</span>
                )}
              </p>
              <dl>
                <div>
                  <dt>Maximum estimé / jour</dt>
                  <dd>{estimates[quota.api]}</dd>
                </div>
                <div>
                  <dt>Limite automatique / jour</dt>
                  <dd>{quota.automaticLimit}</dd>
                </div>
              </dl>
            </div>
          );
        })}
        <p>Source : {dashboard.mode === 'demo' ? 'Démonstration' : 'PRIM'}</p>
        <details className="help-details">
          <summary>Comprendre l’estimation</summary>
          <p>
            Calculée avec les réglages du formulaire et une heure de marge pour le changement
            d’heure. C’est un plafond : PRIM n’est appelé que lorsqu’une page affiche les données,
            au plus une fois par intervalle de collecte. Les blocs de tous les profils sont
            collectés et comptés ; un arrêt ou une ligne partagés par plusieurs profils ne sont
            comptés qu’une fois. Chaque API dispose de 1 000 appels par jour, dont 900 au maximum
            pour la collecte automatique. La découverte des directions utilise le quota des
            passages. Les recherches de gares et de lignes ne consomment aucun appel. Ces compteurs
            suivent uniquement cette instance : les appels effectués ailleurs avec le même compte
            PRIM ne sont pas connus.
          </p>
        </details>
      </section>
      <section>
        <h2>Source des données</h2>
        <p>
          {dashboard.mode === 'demo'
            ? 'Données fictives. Ajoutez PRIM_API_KEY à l’environnement Docker pour activer les données réelles.'
            : 'La clé est fournie par l’environnement du serveur et reste invisible au navigateur.'}
        </p>
        {[status.error?.message, status.data?.configError, status.data?.error]
          .filter(Boolean)
          .map((message) => (
            <p role="alert" className="field-error" key={message}>
              {message}
            </p>
          ))}
        {status.data &&
          [...status.data.stops, ...status.data.traffic].map((entry, i) => (
            <div className="resource-status" key={`${entry.ref}-${i}`}>
              <strong>{entry.ref}</strong>
              <span>
                {entry.at ? `Dernière réception : ${shownDate(entry.at)}` : 'Aucune donnée reçue'}
              </span>
              {entry.error && <p className="field-error">{entry.error}</p>}
            </div>
          ))}
        <p className="field-help">
          Mises à jour de {dashboard.config.defaults.start} à {dashboard.config.defaults.end}, heure
          de Paris, les jours sélectionnés.
        </p>
        {status.data?.timetables && <TimetablesStatus timetables={status.data.timetables} />}
        {status.data?.catalog?.importedAt && (
          <p className="field-help">
            Référentiel des arrêts importé le {shownDate(status.data.catalog.importedAt, false)}.
          </p>
        )}
      </section>
    </aside>
  );
}
