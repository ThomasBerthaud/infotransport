import type { Settings } from '../../shared/model.js';

export type NumericField = {
  key: 'walkMinutes' | 'minimalCount' | 'richCount' | 'pollSeconds';
  label: string;
  help: string;
  min: number;
  max: number;
  unit: string;
};
export const numericFields: NumericField[] = [
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
const field = (key: NumericField['key']) => numericFields.find((f) => f.key === key)!;

function DefaultNumberField({
  field,
  value,
  onChange,
}: {
  field: NumericField;
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

export function DefaultSettings({
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
          <DefaultNumberField field={field('walkMinutes')} value={value} onChange={onChange} />
        </div>
      </section>
      <section className="settings-group">
        <h3>Départs affichés</h3>
        <div className="fields-grid">
          {(['minimalCount', 'richCount'] as const).map((key) => (
            <DefaultNumberField key={key} field={field(key)} value={value} onChange={onChange} />
          ))}
        </div>
      </section>
      <section className="settings-group">
        <h3>Récupération des données</h3>
        <div className="fields-grid">
          <DefaultNumberField field={field('pollSeconds')} value={value} onChange={onChange} />
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
        <ScheduleFields value={value} onChange={onChange} idPrefix="global" />
      </section>
    </div>
  );
}

const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function ScheduleFields({
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
        {dayNames.map((day, i) => (
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
