import type { Block, BlockView, Config, Dashboard } from '../../shared/model.js';
import { settings, shownInMinimal } from '../../shared/model.js';
import { Icon } from '../../components/Icon.js';
import { Line } from '../../components/Block.js';
import { Autocomplete } from '../Autocomplete.js';
import { numericFields, ScheduleFields } from './fields.js';
import { withOverride, withOwnSchedule } from './blocks.js';
import { useBlockLookup, type BlockLookup } from './useBlockLookup.js';

type EditorProps = { block: Block; onChange: (block: Block) => void };

export function BlockEditor({
  block,
  config,
  index,
  onChange,
  onMove,
  onDelete,
  mode,
  savedView,
}: EditorProps & {
  savedView?: BlockView;
  mode: Dashboard['mode'];
  config: Config;
  index: number;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const lookup = useBlockLookup(block, mode, onChange);
  const selectedLine = lookup.lines.data?.find((line) => line.ref === block.lineRef);
  const lineAppearance = selectedLine?.color
    ? { color: selectedLine.color, textColor: selectedLine.textColor }
    : savedView?.block.lineRef === block.lineRef
      ? savedView.lineAppearance
      : undefined;
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
      <CatalogChoice block={block} mode={mode} lookup={lookup} />
      <DisplayFields block={block} config={config} onChange={onChange} />
      <ManualReferences block={block} onChange={onChange} lookup={lookup} />
      <BlockOverrides block={block} config={config} onChange={onChange} />
    </article>
  );
}

function CatalogChoice({
  block,
  mode,
  lookup,
}: {
  block: Block;
  mode: Dashboard['mode'];
  lookup: BlockLookup;
}) {
  return (
    <div className="fields-grid">
      <div className="field field-wide">
        <label htmlFor={`search-${block.id}`}>Gare ou arrêt</label>
        <Autocomplete
          id={`search-${block.id}`}
          label="Gare ou arrêt"
          value={lookup.stopQuery}
          onChange={lookup.typeStop}
          onFocus={() => lookup.lookup(lookup.stopQuery)}
          onSelect={lookup.selectStop}
          options={lookup.stopOptions}
          helpId={`search-help-${block.id}`}
          placeholder="Nom de gare ou d’arrêt…"
          loading={lookup.lookupPending}
          emptyText={
            lookup.stopQuery.trim().length < 2
              ? 'Saisissez au moins 2 caractères.'
              : 'Aucun arrêt trouvé dans le référentiel local.'
          }
        />
        <span className="field-help" id={`search-help-${block.id}`}>
          Recherchez un nom et sélectionnez un arrêt. La recherche ne consomme aucun appel PRIM.
        </span>
        {lookup.search.error && (
          <span className="field-error" role="alert">
            {lookup.search.error.message}
          </span>
        )}
      </div>
      <div className="field catalog-choice">
        <label htmlFor={`choose-line-${block.id}`}>Ligne à suivre</label>
        <Autocomplete
          id={`choose-line-${block.id}`}
          label="Ligne à suivre"
          value={lookup.lineQuery}
          onChange={lookup.setLineQuery}
          onSelect={lookup.selectLine}
          options={lookup.lineOptions}
          disabled={!block.monitoringRef}
          placeholder="Choisir ou saisir une ligne…"
          emptyText="Choisissez d’abord un arrêt du référentiel local."
          loading={lookup.lines.isFetching}
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
          value={lookup.directionQuery}
          onChange={lookup.setDirectionQuery}
          onSelect={lookup.selectDirection}
          options={lookup.directionOptions}
          disabled={!block.lineRef}
          placeholder="Choisir le sens de circulation…"
          loading={lookup.discovery.isFetching}
          helpId={`choose-direction-help-${block.id}`}
          emptyText="Aucun sens annoncé pour cette ligne. Actualisez les directions dans la saisie manuelle."
        />
        <span className="field-help" id={`choose-direction-help-${block.id}`}>
          {mode === 'demo'
            ? 'Directions fictives en mode démonstration.'
            : 'Directions proposées par les prochains passages PRIM.'}
        </span>
      </div>
      {lookup.discovery.error && (
        <p className="field-error field-wide" role="alert">
          {lookup.discovery.error.message}
        </p>
      )}
    </div>
  );
}

const labelFields = [
  {
    key: 'station',
    label: 'Nom de gare affiché',
    maxLength: 60,
    help: 'Libellé à l’écran ; la gare suivie reste la même.',
  },
  { key: 'line', label: 'Nom court de la ligne', maxLength: 12, help: 'Exemples : L, U, RER A.' },
  {
    key: 'direction',
    label: 'Direction affichée',
    maxLength: 70,
    help: 'Libellé à l’écran ; le sens suivi reste le même.',
  },
] as const;

export function DisplayFields({ block, config, onChange }: EditorProps & { config: Config }) {
  const { columns } = config.screen;
  return (
    <section className="block-display" aria-labelledby={`display-title-${block.id}`}>
      <h4 id={`display-title-${block.id}`}>Libellés et affichage</h4>
      <div className="fields-grid">
        {labelFields.map(({ key, label, maxLength, help }) => (
          <label className="field" key={key}>
            {label}
            <input
              required
              maxLength={maxLength}
              value={block[key]}
              aria-label={label}
              aria-describedby={`${key}-help-${block.id}`}
              onChange={(e) => onChange({ ...block, [key]: e.target.value })}
            />
            <span className="field-help" id={`${key}-help-${block.id}`}>
              {help}
            </span>
          </label>
        ))}
        <label className="field">
          Largeur dans la vue épurée
          <select
            value={block.span}
            disabled={block.hideInMinimal}
            aria-label="Largeur dans la vue épurée"
            aria-describedby={`span-help-${block.id}`}
            onChange={(e) => onChange({ ...block, span: Number(e.target.value) })}
          >
            {Array.from({ length: Math.max(columns, block.span) }, (_, i) => i + 1).map((span) => (
              <option key={span} value={span}>
                {span} {span === 1 ? 'colonne' : 'colonnes'}
                {span === columns ? ' · toute la largeur' : ''}
              </option>
            ))}
          </select>
          <span className="field-help" id={`span-help-${block.id}`}>
            Sur une grille de {columns} {columns === 1 ? 'colonne' : 'colonnes'}, réglable dans «
            Affichage & aperçu ».
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
  );
}

function ManualReferences({ block, onChange, lookup }: EditorProps & { lookup: BlockLookup }) {
  return (
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
              lookup.lookup(value);
            }}
            onSelect={lookup.selectStop}
            options={lookup.stopOptions}
            helpId={`monitoring-help-${block.id}`}
            placeholder="Nom ou identifiant…"
            onFocus={() => lookup.lookup(block.monitoringRef || block.station)}
          />
          <span className="field-help" id={`monitoring-help-${block.id}`}>
            Identifie l’arrêt dont PRIM renvoie les départs.
          </span>
          <button
            type="button"
            className="text-button"
            disabled={!block.monitoringRef || lookup.discovery.isFetching}
            onClick={lookup.loadDirections}
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
            onChange={(value) => onChange({ ...block, lineRef: value })}
            onSelect={lookup.selectLine}
            options={lookup.lineOptions}
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
            onChange={(value) => onChange({ ...block, directionRef: value })}
            onSelect={lookup.selectDirection}
            options={lookup.directionOptions}
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
            onChange={(value) => onChange({ ...block, destinationRef: value })}
            onSelect={(option) => onChange({ ...block, destinationRef: option.value })}
            options={lookup.destinationOptions}
            helpId={`destination-ref-help-${block.id}`}
            placeholder="Nom ou identifiant…"
          />
          <span className="field-help" id={`destination-ref-help-${block.id}`}>
            Sans filtre de sens, limite les départs à ce terminus.
          </span>
        </label>
      </div>
    </details>
  );
}

export function BlockOverrides({ block, config, onChange }: EditorProps & { config: Config }) {
  const effective = settings(config, block);
  return (
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
                onChange={(e) => onChange(withOverride(block, f.key, e.target.valueAsNumber))}
              />
              {f.unit && <span aria-hidden="true">{f.unit}</span>}
            </span>
            <button
              className="text-button"
              type="button"
              disabled={block.overrides[f.key] === undefined}
              onClick={() => onChange(withOverride(block, f.key, undefined))}
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
          onChange={(e) => onChange(withOwnSchedule(block, effective, e.target.checked))}
        />
        Définir des horaires propres à ce bloc
      </label>
      <p className="field-help">Les mises à jour restent limitées aux horaires communs.</p>
      {block.overrides.start !== undefined && (
        <ScheduleFields
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
  );
}
