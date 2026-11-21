import type { Dashboard, Departure } from '../shared/model.js';
import { hour, isReachable, minutesUntil } from '../shared/model.js';
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
export function DashboardView({ data }: { data: Dashboard }) {
  return (
    <>
      <div className="page-intro">
        <div>
          <h1>
            Vos prochains départs<span className="heading-dot">.</span>
          </h1>
          <p>Un coup d’œil avant de partir.</p>
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
