import type { Dashboard } from '../shared/model.js';
import { hour, minutesUntil } from '../shared/model.js';
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
          <span className={`status-dot ${data.paused ? 'paused' : ''}`} />
          {data.paused
            ? 'En pause jusqu’à la prochaine plage'
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
                      const close = minutesUntil(d.time, data.now) < view.effective.walkMinutes;
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
                            {d.cancelled ? (
                              <span className="service-cancelled">Supprimé</span>
                            ) : delay > 0 ? (
                              <span className="service-delay">+{delay} min</span>
                            ) : (
                              <span className="service-ok">
                                {d.realtime ? 'Prévu' : 'Théorique'}
                              </span>
                            )}
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
              {view.status !== 'ok' && <p className="block-empty">{statusLabel[view.status]}</p>}
            </section>
          ))}
        </div>
        <TrafficPanel data={data} />
      </div>
    </>
  );
}
