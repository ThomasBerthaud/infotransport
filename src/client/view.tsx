import type { ReactNode } from 'react';
import type { Config, Dashboard, Departure } from '../shared/model.js';
import { dashboardForProfile, hour, isReachable, minutesUntil } from '../shared/model.js';
import { useProfileChoice, type LocationState, type ProfileSelection } from './profile-choice.js';
import { BlockHeading } from '../components/Block.js';
import { TrafficPanel } from './TrafficPanel.js';
const statusLabel = {
  paused: 'Hors plage de fonctionnement',
  unconfigured: 'Choisissez les identifiants PRIM dans les réglages.',
  stale: 'Données trop anciennes. Nouvelle collecte en attente.',
  empty: 'Aucun départ annoncé pour cette direction.',
  error: 'La dernière collecte a échoué.',
  ok: '',
};
function DepartureState({ departure: d, delay }: { departure: Departure; delay: number }) {
  if (d.cancelled) return <span className="service-cancelled">Supprimé</span>;
  // Saved and scheduled times are never shown with a delay: nothing confirms it still holds.
  if (d.source === 'snapshot') return <span className="service-saved">Mémorisé</span>;
  if (d.source === 'scheduled') return <span className="service-scheduled">Théorique</span>;
  if (delay > 0) return <span className="service-delay">+{delay} min</span>;
  return <span className="service-ok">{d.realtime ? 'Prévu' : 'Horaire prévu (PRIM)'}</span>;
}
const locationNotes: Partial<Record<LocationState, string>> = {
  insecure: 'Automatique indisponible sans HTTPS',
  locating: 'Localisation en cours',
  denied: 'Localisation refusée',
  unavailable: 'Position indisponible',
};
function ProfileSelector({ config, selection }: { config: Config; selection: ProfileSelection }) {
  const { choice, manualId, state, select } = selection;
  const note = manualId ? undefined : locationNotes[state];
  return (
    <div className="profile-selector">
      <label>
        <span className="visually-hidden">Profil affiché</span>
        <select
          value={manualId ?? ''}
          aria-describedby={note ? 'profile-note' : undefined}
          onChange={(e) => select(e.target.value || null)}
        >
          <option value="">
            Automatique · {manualId ? 'selon la position' : choice.profile.name}
          </option>
          {config.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <span className="profile-note" id="profile-note" aria-live="polite">
        {note}
        {note && (state === 'denied' || state === 'unavailable') && (
          <button type="button" className="text-button" onClick={() => select(null)}>
            Réessayer
          </button>
        )}
      </span>
    </div>
  );
}
/** The detailed view of the profile chosen on this device. */
export function ProfileDashboard({ data }: { data: Dashboard }) {
  const selection = useProfileChoice(data.config);
  return (
    <DashboardView
      data={dashboardForProfile(data, selection.choice.profile.id)}
      selector={
        data.config.profiles.length > 1 && (
          <ProfileSelector config={data.config} selection={selection} />
        )
      }
    />
  );
}
export function DashboardView({ data, selector }: { data: Dashboard; selector?: ReactNode }) {
  return (
    <>
      <div className="page-intro">
        <div>
          <h1>
            Vos prochains départs<span className="heading-dot">.</span>
          </h1>
          <p>Un coup d’œil avant de partir.</p>
          {selector}
        </div>
        <div className="live-state">
          <span
            className={`status-dot ${data.paused ? 'paused' : data.offline ? 'offline' : ''}`}
          />
          {data.paused
            ? 'En pause jusqu’à la prochaine plage'
            : data.offline
              ? 'Hors connexion'
              : data.mode === 'demo'
                ? 'Aperçu de votre tableau'
                : 'Suivi des départs'}
          <span className="clock">{hour(data.now)}</span>
        </div>
      </div>
      <div className="dashboard-layout">
        <div className="departures-list">
          {data.blocks.map((view) => (
            <section className="departure-block" key={view.block.id}>
              <div className="departure-block-top">
                <BlockHeading view={view} colored />
              </div>
              <div className="table-wrap">
                <table className="departures-table">
                  <thead>
                    <tr>
                      <th>Départ</th>
                      <th>Dans</th>
                      <th>Voie</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.departures.slice(0, view.effective.richCount).map((d, i) => {
                      const close = !isReachable(d.time, data.now, view.effective.walkMinutes);
                      const delay = d.aimedTime
                        ? Math.round((Date.parse(d.time) - Date.parse(d.aimedTime)) / 60000)
                        : 0;
                      return (
                        <tr className={close ? 'departure-too-close' : ''} key={`${d.id}-${i}`}>
                          <td>
                            <time dateTime={d.time}>{hour(d.time)}</time>
                          </td>
                          <td className="wait-time">
                            {d.cancelled ? (
                              '—'
                            ) : (
                              <>
                                {minutesUntil(d.time, data.now)}
                                <small> min</small>
                              </>
                            )}
                          </td>
                          <td>
                            <span className="platform">{d.platform || '—'}</span>
                          </td>
                          <td>
                            <DepartureState departure={d} delay={delay} />
                            {close && !d.cancelled && (
                              <span className="unreachable">Trop proche</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {view.status !== 'ok' && (
                <p className="block-empty">
                  {data.offline && view.status === 'empty'
                    ? 'Plus d’horaires mémorisés utilisables.'
                    : statusLabel[view.status]}
                </p>
              )}
            </section>
          ))}
        </div>
        <TrafficPanel data={data} />
      </div>
    </>
  );
}
