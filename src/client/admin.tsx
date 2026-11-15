import { useCallback, useEffect, useRef, useState } from 'react';
import { Autocomplete, type Suggestion } from './Autocomplete.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  Block,
  BlockView,
  CatalogPlace,
  CatalogLine,
  Config,
  Dashboard,
  Discovery,
  Settings,
  ApiBudget,
} from '../shared/model.js';
import {
  estimatedCallsByApi,
  primQuotas,
  layout,
  shownInMinimal,
  minimalGridSize,
  minimalWarnings,
  settings,
  validateConfig,
} from '../shared/model.js';
import { Icon } from '../components/Icon.js';
import { Line, MinimalBlock } from '../components/Block.js';
import minimalCss from './minimal.css?inline';
import { minimalDebugMarkup } from '../shared/minimal-debug.js';
import { overflowingMinimalBlocks } from './minimal-overflow.js';
import { api } from './api.js';
type Diagnostic = {
  mode: string;
  budget: { apis: ApiBudget[]; window: string };
  error?: string;
  stops: { ref: string; at: number; next: number; error?: string }[];
  traffic: { ref: string; at: number; next: number; error?: string }[];
};
const numericFields: {
  key: 'walkMinutes' | 'minimalCount' | 'richCount' | 'pollSeconds';
  label: string;
  help: string;
  min: number;
  max: number;
  unit: string;
}[] = [
  {
    key: 'walkMinutes',
    label: 'Temps pour rejoindre la gare',
    help: 'Les départs trop proches sont grisés. Incluez votre marge pour rejoindre le quai.',
    min: 0,
    max: 120,
    unit: 'min',
  },
  {
    key: 'minimalCount',
    label: 'Horaires par bloc · vue épurée',
    help: 'De 1 à 5 départs par bloc.',
    min: 1,
    max: 5,
    unit: '',
  },
  {
    key: 'richCount',
    label: 'Horaires par bloc · vue détaillée',
    help: 'De 3 à 30 départs par bloc, selon les données disponibles.',
    min: 3,
    max: 30,
    unit: '',
  },
  {
    key: 'pollSeconds',
    label: 'Intervalle entre les appels PRIM',
    help: 'Un intervalle plus court augmente le nombre d’appels.',
    min: 60,
    max: 3600,
    unit: 's',
  },
];
function DefaultNumberField({
  field,
  value,
  onChange,
}: {
  field: (typeof numericFields)[number];
  value: Settings;
  onChange: (value: Settings) => void;
}) {
  const id = `default-${field.key}`;
  return (
    <label className="field">
      <span id={`${id}-label`}>{field.label}</span>
      <span className="input-with-unit">
        <input
          type="number"
          min={field.min}
          max={field.max}
          required
          value={value[field.key]}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-help`}
          onChange={(e) => onChange({ ...value, [field.key]: e.target.valueAsNumber })}
        />
        {field.unit && <span aria-hidden="true">{field.unit}</span>}
      </span>
      <span className="field-help" id={`${id}-help`}>
        {field.help}
      </span>
    </label>
  );
}
function DefaultSettings({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
}) {
  return (
    <div className="settings-groups">
      <section className="settings-group">
        <h3>Temps de trajet</h3>
        <div className="fields-grid">
          <DefaultNumberField field={numericFields[0]} value={value} onChange={onChange} />
        </div>
      </section>
      <section className="settings-group">
        <h3>Départs affichés</h3>
        <div className="fields-grid">
          {numericFields
            .filter((f) => f.key === 'minimalCount' || f.key === 'richCount')
            .map((field) => (
              <DefaultNumberField key={field.key} field={field} value={value} onChange={onChange} />
            ))}
        </div>
      </section>
      <section className="settings-group">
        <h3>Récupération des données</h3>
        <div className="fields-grid">
          <DefaultNumberField field={numericFields[3]} value={value} onChange={onChange} />
          <p className="field-help settings-explanation">
            Les infos trafic sont récupérées toutes les 15 minutes. Recharger une page ne déclenche
            aucun appel PRIM.
          </p>
        </div>
      </section>
      <section className="settings-group">
        <h3>Horaires de fonctionnement</h3>
        <p className="section-description">
          Hors de cette plage, les appels PRIM et l’actualisation s’arrêtent. Ils reprennent
          automatiquement.
        </p>
        <DefaultSchedule value={value} onChange={onChange} idPrefix="global" />
      </section>
    </div>
  );
}
function BlockEditor({
  block,
  config,
  index,
  onChange,
  onMove,
  onDelete,
  mode,
  savedView,
}: {
  savedView?: BlockView;
  mode: Dashboard['mode'];
  block: Block;
  config: Config;
  index: number;
  onChange: (block: Block) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const [q, setQ] = useState(block.monitoringRef ? block.station : '');
  const [lookupQuery, setLookupQuery] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const [lineQuery, setLineQuery] = useState(block.lineRef ? block.line : '');
  const [directionQuery, setDirectionQuery] = useState(
    block.directionRef || block.destinationRef ? block.direction : '',
  );
  const [ref, setRef] = useState(block.monitoringRef);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(lookupQuery), 200);
    return () => clearTimeout(timer);
  }, [lookupQuery]);
  const search = useQuery({
    queryKey: ['local-stops', debounced],
    queryFn: ({ signal }) =>
      api<CatalogPlace[]>(`/api/stops?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: debounced.trim().length >= 2,
    staleTime: 86400000,
  });
  const lines = useQuery({
    queryKey: ['local-lines', block.monitoringRef],
    queryFn: ({ signal }) =>
      api<CatalogLine[]>(`/api/lines?ref=${encodeURIComponent(block.monitoringRef)}`, { signal }),
    enabled: !!block.monitoringRef,
    staleTime: 86400000,
  });
  const discovery = useQuery({
    queryKey: ['discovery', mode, ref],
    queryFn: ({ signal }) =>
      api<Discovery>(`/api/discover?ref=${encodeURIComponent(ref)}`, { signal }),
    enabled: !!ref,
    staleTime: 180000,
    retry: false,
  });
  const modeNames: Record<string, string> = {
    LocalTrain: 'Train',
    RapidTransit: 'RER',
    Metro: 'Métro',
    Bus: 'Bus',
    Tramway: 'Tramway',
    regionalRail: 'Train régional',
  };
  const stopOptions: Suggestion[] = (search.data || []).map((place) => ({
    value: place.monitoringRef,
    label: place.label,
    detail: [
      place.city,
      modeNames[place.mode || ''] || place.mode,
      place.lines?.map((line) => line.label).join(', '),
      place.monitoringRef,
    ]
      .filter(Boolean)
      .join(' · '),
  }));
  const lineOptions: Suggestion[] = (lines.data || []).map((line) => ({
    value: line.ref,
    label: line.label,
    visualLabel: (
      <Line
        line={line.label}
        appearance={line.color ? { color: line.color, textColor: line.textColor } : undefined}
      />
    ),
    detail: [
      modeNames[line.mode || ''] || line.mode,
      line.name !== line.label ? line.name : '',
      line.operator,
      line.ref,
    ]
      .filter(Boolean)
      .join(' · '),
  }));
  const directions = (discovery.data?.directions || []).filter(
    (direction) => direction.lineRef === block.lineRef,
  );
  const directionOptions: Suggestion[] = directions.map((direction) => ({
    value: direction.directionRef || direction.destinationRef,
    label: direction.name,
    detail: direction.directionRef || direction.destinationRef,
  }));
  const destinationOptions: Suggestion[] = directions
    .filter((direction) => !!direction.destinationRef)
    .map((direction) => ({
      value: direction.destinationRef,
      label: direction.name,
      detail: direction.destinationRef,
    }));
  const selectStop = (option: Suggestion) => {
    const place = search.data?.find((place) => place.monitoringRef === option.value);
    if (!place) return;
    onChange({
      ...block,
      station: place.label,
      monitoringRef: place.monitoringRef,
      lineRef: '',
      directionRef: '',
      destinationRef: '',
    });
    setQ(place.label);
    setLookupQuery(place.label);
    setLineQuery('');
    setDirectionQuery('');
    setRef(place.monitoringRef);
  };
  const selectLine = (option: Suggestion) => {
    onChange({
      ...block,
      lineRef: option.value,
      line: option.label,
      directionRef: '',
      destinationRef: '',
    });
    setLineQuery(option.label);
    setDirectionQuery('');
  };
  const selectDirection = (option: Suggestion) => {
    const found = directions.find(
      (direction) => (direction.directionRef || direction.destinationRef) === option.value,
    );
    if (found) {
      onChange({
        ...block,
        direction: found.name,
        directionRef: found.directionRef,
        destinationRef: found.destinationRef,
      });
      setDirectionQuery(found.name);
    }
  };
  const selectedLine = lines.data?.find((line) => line.ref === block.lineRef);
  const lineAppearance = selectedLine?.color
    ? { color: selectedLine.color, textColor: selectedLine.textColor }
    : savedView?.block.lineRef === block.lineRef
      ? savedView.lineAppearance
      : undefined;
  const effective = settings(config, block);
  const setOverride = (key: keyof Settings, value: unknown) => {
    const overrides = { ...block.overrides };
    if (value === undefined) delete overrides[key];
    else Object.assign(overrides, { [key]: value });
    onChange({ ...block, overrides });
  };
  return (
    <article className="block-editor">
      <div className="editor-top">
        <Line line={block.line || '?'} appearance={lineAppearance} />
        <h3>
          {block.station || 'Nouvelle gare'}
          <span>{block.direction || 'Direction à choisir'}</span>
        </h3>
        <div className="editor-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Monter le bloc"
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onMove(1)}
            disabled={index === config.blocks.length - 1}
            aria-label="Descendre le bloc"
          >
            <Icon name="down" />
          </button>
          <button
            type="button"
            className="text-button danger"
            onClick={onDelete}
            disabled={config.blocks.length === 1}
          >
            Retirer
          </button>
        </div>
      </div>
      <div className="fields-grid">
        <div className="field field-wide">
          <label htmlFor={`search-${block.id}`}>Gare ou arrêt</label>
          <Autocomplete
            id={`search-${block.id}`}
            label="Gare ou arrêt"
            value={q}
            onChange={(value) => {
              setQ(value);
              setLookupQuery(value);
            }}
            onFocus={() => setLookupQuery(q)}
            onSelect={selectStop}
            options={stopOptions}
            helpId={`search-help-${block.id}`}
            placeholder="Nom de gare ou d’arrêt…"
            loading={search.isFetching || lookupQuery !== debounced}
            emptyText={
              q.trim().length < 2
                ? 'Saisissez au moins 2 caractères.'
                : 'Aucun arrêt trouvé dans le référentiel local.'
            }
          />
          <span className="field-help" id={`search-help-${block.id}`}>
            Recherchez un nom et sélectionnez un arrêt. La recherche ne consomme aucun appel PRIM.
          </span>
          {search.error && (
            <span className="field-error" role="alert">
              {search.error.message}
            </span>
          )}
        </div>
        <div className="field catalog-choice">
          <label htmlFor={`choose-line-${block.id}`}>Ligne à suivre</label>
          <Autocomplete
            id={`choose-line-${block.id}`}
            label="Ligne à suivre"
            value={lineQuery}
            onChange={setLineQuery}
            onSelect={selectLine}
            options={lineOptions}
            disabled={!block.monitoringRef}
            placeholder="Choisir ou saisir une ligne…"
            emptyText="Choisissez d’abord un arrêt du référentiel local."
            loading={lines.isFetching}
            helpId={`choose-line-help-${block.id}`}
          />
          <span className="field-help" id={`choose-line-help-${block.id}`}>
            Choisissez une ligne desservant cet arrêt.
          </span>
        </div>
        <div className="field catalog-choice">
          <label htmlFor={`choose-direction-${block.id}`}>Sens ou terminus à suivre</label>
          <Autocomplete
            id={`choose-direction-${block.id}`}
            label="Sens ou terminus à suivre"
            value={directionQuery}
            onChange={setDirectionQuery}
            onSelect={selectDirection}
            options={directionOptions}
            disabled={!block.lineRef}
            placeholder="Choisir le sens de circulation…"
            loading={discovery.isFetching}
            helpId={`choose-direction-help-${block.id}`}
            emptyText="Aucun sens annoncé pour cette ligne. Actualisez les directions dans la saisie manuelle."
          />
          <span className="field-help" id={`choose-direction-help-${block.id}`}>
            {mode === 'demo'
              ? 'Directions fictives en mode démonstration.'
              : 'Directions proposées par les prochains passages PRIM.'}
          </span>
        </div>
        {discovery.error && (
          <p className="field-error field-wide" role="alert">
            {discovery.error.message}
          </p>
        )}
      </div>
      <section className="block-display" aria-labelledby={`display-title-${block.id}`}>
        <h4 id={`display-title-${block.id}`}>Libellés et affichage</h4>
        <div className="fields-grid">
          <label className="field">
            Nom de gare affiché
            <input
              required
              maxLength={60}
              value={block.station}
              aria-label="Nom de gare affiché"
              aria-describedby={`station-help-${block.id}`}
              onChange={(e) => onChange({ ...block, station: e.target.value })}
            />
            <span className="field-help" id={`station-help-${block.id}`}>
              Libellé à l’écran ; la gare suivie reste la même.
            </span>
          </label>
          <label className="field">
            Nom court de la ligne
            <input
              required
              maxLength={12}
              value={block.line}
              aria-label="Nom court de la ligne"
              aria-describedby={`line-help-${block.id}`}
              onChange={(e) => onChange({ ...block, line: e.target.value })}
            />
            <span className="field-help" id={`line-help-${block.id}`}>
              Exemples : L, U, RER A.
            </span>
          </label>
          <label className="field">
            Direction affichée
            <input
              required
              maxLength={70}
              value={block.direction}
              aria-label="Direction affichée"
              aria-describedby={`direction-help-${block.id}`}
              onChange={(e) => onChange({ ...block, direction: e.target.value })}
            />
            <span className="field-help" id={`direction-help-${block.id}`}>
              Libellé à l’écran ; le sens suivi reste le même.
            </span>
          </label>
          <label className="field">
            Largeur dans la vue épurée
            <select
              value={block.span}
              disabled={block.hideInMinimal}
              aria-label="Largeur dans la vue épurée"
              aria-describedby={`span-help-${block.id}`}
              onChange={(e) => onChange({ ...block, span: Number(e.target.value) })}
            >
              {Array.from(
                { length: Math.max(config.screen.columns, block.span) },
                (_, i) => i + 1,
              ).map((span) => (
                <option key={span} value={span}>
                  {span} {span === 1 ? 'colonne' : 'colonnes'}
                  {span === config.screen.columns ? ' · toute la largeur' : ''}
                </option>
              ))}
            </select>
            <span className="field-help" id={`span-help-${block.id}`}>
              Sur une grille de {config.screen.columns}{' '}
              {config.screen.columns === 1 ? 'colonne' : 'colonnes'}, réglable dans « Affichage &
              aperçu ».
            </span>
          </label>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={shownInMinimal(block)}
            aria-describedby={`visibility-help-${block.id}`}
            onChange={(e) => onChange({ ...block, hideInMinimal: !e.target.checked })}
          />
          Afficher dans la vue épurée
        </label>
        <p className="field-help" id={`visibility-help-${block.id}`}>
          Décochez pour garder ce bloc uniquement dans la vue détaillée.
        </p>
      </section>
      <details className="advanced">
        <summary>Identifiants PRIM · saisie manuelle</summary>
        <p className="settings-note">
          Les choix ci-dessus remplissent ces références. Modifiez-les ici pour saisir un code
          manuellement. En mode réel, renseignez une gare, une ligne et un sens ou un terminus.
        </p>
        <div className="fields-grid">
          <label className="field field-wide" htmlFor={`manual-monitoringRef-${block.id}`}>
            Gare interrogée · MonitoringRef
            <Autocomplete
              id={`manual-monitoringRef-${block.id}`}
              label="Gare interrogée · MonitoringRef"
              value={block.monitoringRef}
              onChange={(value) => {
                onChange({ ...block, monitoringRef: value });
                setLookupQuery(value);
              }}
              onSelect={selectStop}
              options={stopOptions}
              helpId={`monitoring-help-${block.id}`}
              placeholder="Nom ou identifiant…"
              onFocus={() => setLookupQuery(block.monitoringRef || block.station)}
            />
            <span className="field-help" id={`monitoring-help-${block.id}`}>
              Identifie l’arrêt dont PRIM renvoie les départs.
            </span>
            <button
              type="button"
              className="text-button"
              disabled={!block.monitoringRef || discovery.isFetching}
              onClick={() => {
                if (ref === block.monitoringRef) void discovery.refetch();
                else setRef(block.monitoringRef);
              }}
            >
              Charger les directions
            </button>
          </label>
          <label className="field" htmlFor={`manual-lineRef-${block.id}`}>
            Ligne interrogée · LineRef
            <Autocomplete
              id={`manual-lineRef-${block.id}`}
              label="Ligne interrogée · LineRef"
              value={block.lineRef}
              onChange={(value) => {
                onChange({ ...block, lineRef: value });
              }}
              onSelect={selectLine}
              options={lineOptions}
              helpId={`line-ref-help-${block.id}`}
              placeholder="Nom ou identifiant…"
            />
            <span className="field-help" id={`line-ref-help-${block.id}`}>
              Identifie la ligne interrogée, indépendamment de son nom affiché.
            </span>
          </label>
          <label className="field" htmlFor={`manual-directionRef-${block.id}`}>
            Sens de circulation · DirectionRef
            <Autocomplete
              id={`manual-directionRef-${block.id}`}
              label="Sens de circulation · DirectionRef"
              value={block.directionRef}
              onChange={(value) => {
                onChange({ ...block, directionRef: value });
              }}
              onSelect={selectDirection}
              options={directionOptions}
              helpId={`direction-ref-help-${block.id}`}
              placeholder="Nom ou identifiant…"
            />
            <span className="field-help" id={`direction-ref-help-${block.id}`}>
              Inclut tous les terminus dans ce sens. Prioritaire sur le filtre de terminus.
            </span>
          </label>
          <label className="field field-wide" htmlFor={`manual-destinationRef-${block.id}`}>
            Terminus à filtrer · DestinationRef
            <Autocomplete
              id={`manual-destinationRef-${block.id}`}
              label="Terminus à filtrer · DestinationRef"
              value={block.destinationRef}
              onChange={(value) => {
                onChange({ ...block, destinationRef: value });
              }}
              onSelect={(option) => onChange({ ...block, destinationRef: option.value })}
              options={destinationOptions}
              helpId={`destination-ref-help-${block.id}`}
              placeholder="Nom ou identifiant…"
            />
            <span className="field-help" id={`destination-ref-help-${block.id}`}>
              Sans filtre de sens, limite les départs à ce terminus.
            </span>
          </label>
        </div>
      </details>
      <details className="advanced">
        <summary>Personnaliser les réglages de ce bloc</summary>
        <p className="settings-note">
          Modifiez uniquement les valeurs propres à ce bloc. « Utiliser le réglage commun » rétablit
          l’héritage des réglages communs.
        </p>
        <div className="overrides">
          {numericFields.map((f) => (
            <div className="override-row" key={f.key}>
              <label htmlFor={`${block.id}-${f.key}`}>
                <span id={`${block.id}-${f.key}-label`}>{f.label}</span>
                <small>
                  {block.overrides[f.key] === undefined
                    ? `Réglage commun : ${config.defaults[f.key]} ${f.unit}`
                    : 'Personnalisé pour ce bloc'}
                </small>
                <span className="field-help" id={`${block.id}-${f.key}-help`}>
                  {f.help}
                </span>
              </label>
              <span className="input-with-unit">
                <input
                  id={`${block.id}-${f.key}`}
                  aria-labelledby={`${block.id}-${f.key}-label`}
                  aria-describedby={`${block.id}-${f.key}-help`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={effective[f.key]}
                  onChange={(e) => setOverride(f.key, e.target.valueAsNumber)}
                />
                {f.unit && <span aria-hidden="true">{f.unit}</span>}
              </span>
              <button
                className="text-button"
                type="button"
                disabled={block.overrides[f.key] === undefined}
                onClick={() => setOverride(f.key, undefined)}
              >
                Utiliser le réglage commun
              </button>
            </div>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={block.overrides.start !== undefined}
            onChange={(e) => {
              const overrides = { ...block.overrides };
              if (e.target.checked) {
                overrides.start = effective.start;
                overrides.end = effective.end;
                overrides.days = [...effective.days];
              } else {
                delete overrides.start;
                delete overrides.end;
                delete overrides.days;
              }
              onChange({ ...block, overrides });
            }}
          />
          Définir des horaires propres à ce bloc
        </label>
        <p className="field-help">Les mises à jour restent limitées aux horaires communs.</p>
        {block.overrides.start !== undefined && (
          <DefaultSchedule
            value={effective}
            idPrefix={block.id}
            onChange={(s) =>
              onChange({
                ...block,
                overrides: { ...block.overrides, start: s.start, end: s.end, days: s.days },
              })
            }
          />
        )}
      </details>
    </article>
  );
}
function DefaultSchedule({
  value,
  onChange,
  idPrefix,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  idPrefix: string;
}) {
  return (
    <div className="fields-grid">
      <label className="field">
        <span id={`${idPrefix}-start-label`}>Début des mises à jour</span>
        <input
          type="time"
          required
          aria-labelledby={`${idPrefix}-start-label`}
          aria-describedby={`${idPrefix}-schedule-help`}
          value={value.start}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
      </label>
      <label className="field">
        <span id={`${idPrefix}-end-label`}>Fin des mises à jour</span>
        <input
          type="time"
          required
          aria-labelledby={`${idPrefix}-end-label`}
          aria-describedby={`${idPrefix}-schedule-help`}
          value={value.end}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </label>
      <p className="field-help field-wide schedule-help" id={`${idPrefix}-schedule-help`}>
        Heure de Paris. Une fin avant le début indique une plage de nuit. Deux heures identiques
        autorisent toute la journée.
      </p>
      <fieldset className="days-field">
        <legend>Jours de fonctionnement</legend>
        {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((day, i) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={value.days.includes(i + 1)}
              onChange={(e) =>
                onChange({
                  ...value,
                  days: e.target.checked
                    ? [...value.days, i + 1]
                    : value.days.filter((d) => d !== i + 1),
                })
              }
            />
            {day}
          </label>
        ))}
        <p className="field-help">
          Pour une plage qui passe minuit, cochez le jour où elle commence.
        </p>
      </fieldset>
    </div>
  );
}
function Preview({
  config,
  dashboard,
  onMeasure,
  hidden = false,
}: {
  config: Config;
  dashboard: Dashboard;
  onMeasure: (ids: string[]) => void;
  hidden?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const width =
    Number.isFinite(config.screen.width) && config.screen.width > 0 ? config.screen.width : 800;
  const height =
    Number.isFinite(config.screen.height) && config.screen.height > 0 ? config.screen.height : 600;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { columns, rows } = config.screen;
  const minimum = minimalGridSize(config);
  const { cells } = layout(config.blocks, columns);
  const visibleBlocks = config.blocks.filter(shownInMinimal);
  const html = visibleBlocks
    .map((block) => {
      const old = dashboard.blocks.find((v) => v.block.id === block.id);
      const view = old
        ? { ...old, block, effective: settings(config, block) }
        : {
            block,
            effective: settings(config, block),
            departures: [],
            incidents: [],
            status: 'empty' as const,
            trafficKnown: false,
          };
      const cell = cells.find((c) => c.id === block.id)!;
      return `<div class="minimal-cell" style="top:${(cell.row * 100) / rows}%;left:${(cell.col * 100) / columns}%;width:${(cell.span * 100) / columns}%;height:${100 / rows}%">${renderToStaticMarkup(<MinimalBlock view={view} now={dashboard.now} />)}</div>`;
    })
    .join('');
  const content = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${minimalCss}</style></head><body class="minimal-page"><div class="minimal-grid" style="min-width:${minimum.width}px;min-height:${minimum.height}px">${html}</div>${minimalDebugMarkup(config.screen.debugDimensions, { width, height })}</body></html>`;
  return (
    <div
      ref={container}
      className="minimal-preview"
      aria-hidden={hidden || undefined}
      style={{
        aspectRatio: `${width} / ${height}`,
        ...(hidden ? { position: 'absolute', left: -10000, width, visibility: 'hidden' } : {}),
      }}
    >
      <iframe
        title="Prévisualisation de la vue épurée"
        sandbox="allow-same-origin"
        srcDoc={content}
        onLoad={async (event) => {
          const frame = event.currentTarget;
          const document = frame.contentDocument;
          if (!document) return;
          await document.fonts.ready;
          if (frame.contentDocument !== document || !frame.isConnected) return;
          onMeasure(overflowingMinimalBlocks(document).map((index) => visibleBlocks[index].id));
        }}
        style={{ width, height, transform: `scale(${availableWidth / width})` }}
      />
    </div>
  );
}
export function Admin({ dashboard }: { dashboard: Dashboard }) {
  const [draft, setDraft] = useState<Config>(() => structuredClone(dashboard.config));
  const [measurement, setMeasurement] = useState<{ config: Config; ids: string[] }>();
  const onMeasure = useCallback(
    (ids: string[]) => {
      setMeasurement({ config: draft, ids });
    },
    [draft],
  );
  const [tab, setTab] = useState<'blocks' | 'defaults' | 'screen'>('blocks');
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => api<Diagnostic>('/api/status', { signal }),
    refetchInterval: dashboard.paused ? false : 30000,
  });
  const save = useMutation({
    mutationFn: (config: Config) =>
      api<Config>('/api/config', { method: 'PUT', body: JSON.stringify(config) }),
    onSuccess: (config) => {
      setDraft(config);
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void client.invalidateQueries({ queryKey: ['status'] });
    },
  });
  const update = (next: Config) => {
    setDraft(next);
    save.reset();
  };
  let invalid = '';
  let warnings: string[] = [];
  try {
    warnings = minimalWarnings(
      validateConfig(draft),
      measurement?.config === draft ? measurement.ids : [],
    );
  } catch (error) {
    invalid = (error as Error).message;
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(dashboard.config);
  return (
    <>
      <div className="page-intro">
        <div>
          <h1>
            Réglages du tableau<span className="heading-dot">.</span>
          </h1>
          <p>Choisissez les lignes à suivre et leur présentation.</p>
        </div>
      </div>
      <div className="admin-layout">
        {tab !== 'screen' && (
          <Preview config={draft} dashboard={dashboard} onMeasure={onMeasure} hidden />
        )}
        <div>
          <div className="admin-tabs" role="tablist" aria-label="Catégories de réglages">
            {(
              [
                ['blocks', 'Blocs suivis'],
                ['defaults', 'Réglages communs'],
                ['screen', 'Affichage & aperçu'],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                role="tab"
                id={`tab-${key}`}
                aria-controls="settings-panel"
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                onKeyDown={(event) => {
                  const keys = ['blocks', 'defaults', 'screen'] as const;
                  const current = keys.indexOf(tab);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : event.key === 'ArrowRight'
                          ? (current + 1) % 3
                          : event.key === 'ArrowLeft'
                            ? (current + 2) % 3
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setTab(keys[next]!);
                  document.getElementById(`tab-${keys[next]}`)?.focus();
                }}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid) save.mutate(draft);
            }}
          >
            {tab === 'blocks' && (
              <>
                <div className="section-heading">
                  <h2>Vos gares et directions</h2>
                  <span>
                    {draft.blocks.length} {draft.blocks.length === 1 ? 'bloc' : 'blocs'}
                  </span>
                </div>
                <p className="section-description">
                  Un bloc suit une gare, une ligne et une direction. Les flèches changent l’ordre
                  d’affichage.
                </p>
                {draft.blocks.map((block, index) => (
                  <BlockEditor
                    key={block.id}
                    block={block}
                    config={draft}
                    mode={dashboard.mode}
                    savedView={dashboard.blocks.find((view) => view.block.id === block.id)}
                    index={index}
                    onChange={(b) =>
                      update({
                        ...draft,
                        blocks: draft.blocks.map((old) => (old.id === b.id ? b : old)),
                      })
                    }
                    onMove={(delta) => {
                      const blocks = [...draft.blocks];
                      [blocks[index], blocks[index + delta]] = [
                        blocks[index + delta]!,
                        blocks[index]!,
                      ];
                      update({ ...draft, blocks });
                    }}
                    onDelete={() =>
                      update({ ...draft, blocks: draft.blocks.filter((b) => b.id !== block.id) })
                    }
                  />
                ))}
                <button
                  type="button"
                  className="add-block"
                  onClick={() =>
                    update({
                      ...draft,
                      blocks: [
                        ...draft.blocks,
                        {
                          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                          station: 'Nouvelle gare',
                          line: '?',
                          direction: 'Direction à choisir',
                          monitoringRef: '',
                          lineRef: '',
                          directionRef: '',
                          destinationRef: '',
                          span: draft.screen.columns,
                          overrides: {},
                        },
                      ],
                    })
                  }
                  disabled={draft.blocks.length >= 12}
                >
                  + Ajouter un bloc
                </button>
              </>
            )}
            {tab === 'defaults' && (
              <section className="settings-section">
                <h2>Réglages communs à tous les blocs</h2>
                <p className="section-description">
                  Ces valeurs s’appliquent aux blocs qui n’ont pas de réglage personnalisé.
                </p>
                <DefaultSettings
                  value={draft.defaults}
                  onChange={(defaults) => update({ ...draft, defaults })}
                />
              </section>
            )}
            {tab === 'screen' && (
              <section className="settings-section screen-settings">
                <h2>Vue épurée</h2>
                <p className="section-description">
                  Ajustez la grille et les dimensions pour votre écran. Vérifiez le résultat dans
                  l’aperçu avant d’enregistrer.
                </p>
                <div className="settings-groups">
                  <section className="settings-group">
                    <h3>Disposition des blocs</h3>
                    <div className="fields-grid">
                      {(['columns', 'rows'] as const).map((key) => (
                        <label className="field" key={key}>
                          {key === 'columns' ? 'Colonnes' : 'Lignes'}
                          <select
                            value={draft.screen[key]}
                            aria-label={key === 'columns' ? 'Colonnes' : 'Lignes'}
                            aria-describedby={`screen-${key}-help`}
                            onChange={(e) =>
                              update({
                                ...draft,
                                screen: { ...draft.screen, [key]: Number(e.target.value) },
                              })
                            }
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                          <span className="field-help" id={`screen-${key}-help`}>
                            {key === 'columns'
                              ? 'La largeur de chaque bloc se choisit dans « Blocs suivis ».'
                              : 'Toutes ont la même hauteur, même les lignes vides.'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                  <section className="settings-group">
                    <h3>Dimensions de l’écran</h3>
                    <p className="section-description" id="screen-dimensions-help">
                      Utilisez la largeur et la hauteur disponibles dans le navigateur de l’écran
                      cible, sans ses barres d’outils.
                    </p>
                    <div className="fields-grid">
                      {(['width', 'height'] as const).map((key) => (
                        <label className="field" key={key}>
                          {key === 'width' ? 'Largeur' : 'Hauteur'}
                          <span className="input-with-unit">
                            <input
                              required
                              type="number"
                              min={key === 'width' ? 320 : 240}
                              max={key === 'width' ? 3840 : 2160}
                              value={draft.screen[key]}
                              aria-label={key === 'width' ? 'Largeur (pixels)' : 'Hauteur (pixels)'}
                              aria-describedby="screen-dimensions-help"
                              onChange={(e) =>
                                update({
                                  ...draft,
                                  screen: { ...draft.screen, [key]: e.target.valueAsNumber },
                                })
                              }
                            />
                            <span aria-hidden="true">px</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="screen-measurement">
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={draft.screen.debugDimensions ?? false}
                          aria-describedby="screen-debug-help"
                          onChange={(e) =>
                            update({
                              ...draft,
                              screen: { ...draft.screen, debugDimensions: e.target.checked },
                            })
                          }
                        />
                        Afficher les dimensions réelles
                      </label>
                      <p className="field-help" id="screen-debug-help">
                        Relevez les valeurs dans la vue épurée sur l’écran cible, puis reportez-les
                        ci-dessus. L’indicateur apparaît au prochain rafraîchissement après
                        enregistrement.
                      </p>
                    </div>
                  </section>
                  <section className="settings-group">
                    <h3>Actualisation des deux vues</h3>
                    <div className="fields-grid">
                      <label className="field">
                        Intervalle
                        <span className="input-with-unit">
                          <input
                            required
                            type="number"
                            min={15}
                            max={3600}
                            value={draft.screen.refreshSeconds}
                            aria-label="Intervalle (secondes)"
                            aria-describedby="screen-refresh-help"
                            onChange={(e) =>
                              update({
                                ...draft,
                                screen: { ...draft.screen, refreshSeconds: e.target.valueAsNumber },
                              })
                            }
                          />
                          <span aria-hidden="true">s</span>
                        </span>
                      </label>
                      <p className="field-help settings-explanation" id="screen-refresh-help">
                        Recharge les deux vues avec les données déjà reçues. La fréquence des appels
                        PRIM se règle dans « Réglages communs ».
                      </p>
                    </div>
                  </section>
                </div>
                <section className="screen-preview" aria-labelledby="screen-preview-title">
                  <div className="screen-preview-heading">
                    <h3 id="screen-preview-title">Aperçu</h3>
                    <p className="screen-preview-dimensions">
                      {draft.screen.width} × {draft.screen.height} px
                    </p>
                  </div>
                  <p className="field-help" id="screen-preview-help">
                    Aperçu mis à l’échelle. Sur l’écran cible, les textes gardent leur taille et le
                    contenu hors écran est coupé, sans défilement.
                  </p>
                  <Preview config={draft} dashboard={dashboard} onMeasure={onMeasure} />
                </section>
              </section>
            )}
            <div className="save-bar">
              {warnings.length > 0 && (
                <div className="layout-warning" aria-live="polite">
                  <Icon name="overflow" size={24} />
                  <div className="layout-warning-content">
                    <strong>Risque de débordement sur la vue épurée</strong>
                    <p>Vous pouvez enregistrer. La partie hors écran restera inaccessible.</p>
                    <details className="layout-warning-details">
                      <summary>
                        <Icon name="right" size={16} />
                        Voir les limites de cette disposition
                      </summary>
                      <ul>
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </div>
              )}
              {invalid && (
                <p role="alert" className="field-error">
                  {invalid}
                </p>
              )}
              {save.error && (
                <p className="field-error" role="alert">
                  {save.error.message}
                </p>
              )}
              <div className="save-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!!invalid || save.isPending || !changed}
                >
                  {save.isPending ? 'Enregistrement…' : 'Enregistrer les réglages'}
                </button>
              </div>
            </div>
          </form>
        </div>
        <aside className="admin-sidebar">
          <section>
            <div className="section-heading">
              <h2>Budget PRIM</h2>
            </div>
            <p>Quotas indépendants · suivi local sur 24 heures glissantes</p>
            {primQuotas.map((quota) => {
              const usage = status.data?.budget.apis.find((item) => item.api === quota.api);
              const used = usage?.used;
              const percent =
                used === undefined ? undefined : Math.round((used / quota.limit) * 100);
              const level =
                used === undefined
                  ? 'unknown'
                  : used >= quota.limit
                    ? 'exhausted'
                    : used >= quota.limit * 0.9
                      ? 'critical'
                      : used >= quota.limit * 0.8
                        ? 'warning'
                        : 'normal';
              const consumption =
                level === 'exhausted'
                  ? 'Quota atteint'
                  : level === 'critical'
                    ? 'Quota presque atteint'
                    : level === 'warning'
                      ? 'Consommation élevée'
                      : 'utilisés';
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
                      used === undefined
                        ? 'Compteur indisponible'
                        : `${used} appels sur ${quota.limit}`
                    }
                  />
                  <p className="budget-consumption">
                    <strong>
                      {percent === undefined ? '—' : `${percent} %`}{' '}
                      {percent === undefined ? 'Consommation inconnue' : consumption}
                    </strong>
                    {used !== undefined && (
                      <span>
                        {Math.max(0, quota.limit - used).toLocaleString('fr-FR')} restants
                      </span>
                    )}
                  </p>
                  <dl>
                    <div>
                      <dt>Estimation automatique / jour</dt>
                      <dd>{estimatedCallsByApi(draft)[quota.api]}</dd>
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
                d’heure. Chaque API dispose de 1 000 appels par jour, dont 900 au maximum pour la
                collecte automatique. La découverte des directions utilise le quota des passages.
                Les recherches de gares et de lignes ne consomment aucun appel. Ces compteurs
                suivent uniquement cette instance : les appels effectués ailleurs avec le même
                compte PRIM ne sont pas connus.
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
            {status.error && (
              <p role="alert" className="field-error">
                {status.error.message}
              </p>
            )}
            {status.data?.error && (
              <p role="alert" className="field-error">
                {status.data.error}
              </p>
            )}
            {status.data &&
              [...status.data.stops, ...status.data.traffic].map((entry, i) => (
                <div className="resource-status" key={`${entry.ref}-${i}`}>
                  <strong>{entry.ref}</strong>
                  <span>
                    {entry.at
                      ? `Dernière réception : ${new Date(entry.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`
                      : 'Aucune donnée reçue'}
                  </span>
                  {entry.error && <p className="field-error">{entry.error}</p>}
                </div>
              ))}
            <p className="field-help">
              Mises à jour de {dashboard.config.defaults.start} à {dashboard.config.defaults.end},
              heure de Paris, les jours sélectionnés.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
