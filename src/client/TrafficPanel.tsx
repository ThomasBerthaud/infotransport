/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Named scroll regions need keyboard focus for reading long text; the carousel also supports arrow-key navigation. */
import { useEffect, useRef, useState } from 'react';
import type { Dashboard, Incident } from '../shared/model.js';
import { Icon } from '../components/Icon.js';
import { IncidentIcon, Line } from '../components/Block.js';

function IncidentCarousel({ incidents, data }: { incidents: Incident[]; data: Dashboard }) {
  const track = useRef<HTMLElement>(null);
  const position = useRef(0);
  const [index, setIndex] = useState(0);
  const multiple = incidents.length > 1;

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      element.scrollTo({ left: position.current * element.clientWidth, behavior: 'instant' });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function navigate(target: number) {
    const element = track.current;
    if (!element) return;
    const next = Math.max(0, Math.min(incidents.length - 1, target));
    element.scrollTo({
      left: next * element.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }

  return (
    <>
      <section
        className="incident-carousel"
        ref={track}
        aria-label={multiple ? 'Informations trafic, carrousel' : 'Information trafic'}
        aria-roledescription={multiple ? 'carrousel' : undefined}
        tabIndex={multiple ? 0 : undefined}
        onKeyDown={(event) => {
          if (multiple && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            navigate(index + (event.key === 'ArrowRight' ? 1 : -1));
          }
        }}
        onScroll={() => {
          const element = track.current;
          if (!element?.clientWidth) return;
          const next = Math.max(
            0,
            Math.min(incidents.length - 1, Math.round(element.scrollLeft / element.clientWidth)),
          );
          position.current = next;
          setIndex(next);
        }}
      >
        {incidents.map((incident, slide) => (
          <article
            className="incident incident-slide"
            key={incident.id}
            inert={multiple && slide !== index}
            aria-roledescription={multiple ? 'diapositive' : undefined}
            aria-label={`${slide + 1} sur ${incidents.length} : ${incident.title}`}
          >
            <div className="incident-top">
              <IncidentIcon />
              {[
                ...new Map(
                  data.blocks
                    .filter((view) => view.incidents.some((i) => i.id === incident.id))
                    .map((view) => [view.block.lineRef || view.block.line, view]),
                ).values(),
              ].map((view) => (
                <Line
                  key={view.block.lineRef || view.block.line}
                  line={view.block.line}
                  appearance={view.lineAppearance}
                />
              ))}
            </div>
            <section
              className="incident-content"
              tabIndex={0}
              aria-label={`Détail de l’information : ${incident.title}`}
            >
              <h3>{incident.title}</h3>
              <p>{incident.text}</p>
              {incident.starts && (
                <p className="incident-period">
                  À partir du{' '}
                  {new Date(incident.starts).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                </p>
              )}
              {incident.ends && (
                <p className="incident-period">
                  Jusqu’au{' '}
                  {new Date(incident.ends).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                </p>
              )}
              {incident.url && /^https?:\/\//.test(incident.url) && (
                <a href={incident.url} target="_blank" rel="noreferrer">
                  Consulter l’information source <Icon name="external" size={14} />
                </a>
              )}
            </section>
          </article>
        ))}
      </section>
      {multiple && (
        <div className="incident-navigation">
          <output aria-live="polite" aria-atomic="true" aria-label="Information affichée">
            {index + 1} / {incidents.length}
          </output>
          <div>
            <button
              type="button"
              className="incident-arrow"
              aria-label="Information trafic précédente"
              disabled={index === 0}
              onClick={() => navigate(index - 1)}
            >
              <Icon name="left" size={20} />
            </button>
            <button
              type="button"
              className="incident-arrow"
              aria-label="Information trafic suivante"
              disabled={index === incidents.length - 1}
              onClick={() => navigate(index + 1)}
            >
              <Icon name="right" size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function TrafficPanel({ data }: { data: Dashboard }) {
  const incidents = [
    ...new Map(
      data.blocks.flatMap((view) => view.incidents).map((incident) => [incident.id, incident]),
    ).values(),
  ];
  const known = data.blocks.every((block) => block.trafficKnown);
  return (
    <aside className="traffic-panel" aria-labelledby="traffic-title">
      <div className="section-heading">
        <h2 id="traffic-title">Infos trafic</h2>
        <span>
          {incidents.length} information{incidents.length > 1 ? 's' : ''}
        </span>
      </div>
      {incidents.length ? (
        <IncidentCarousel
          key={JSON.stringify(incidents.map((incident) => incident.id))}
          incidents={incidents}
          data={data}
        />
      ) : (
        <div className="traffic-empty">
          <h3>{known ? 'Aucune perturbation signalée' : 'Informations trafic en attente'}</h3>
          <p>
            {data.paused
              ? 'La collecte reprendra à la prochaine plage active.'
              : known
                ? 'Sur les lignes que vous suivez.'
                : 'Consultez les réglages pour vérifier la connexion PRIM.'}
          </p>
        </div>
      )}
      <p className="traffic-source">
        Source :{' '}
        {data.mode === 'demo' ? 'données de démonstration' : 'Île-de-France Mobilités · PRIM'}
      </p>
    </aside>
  );
}
