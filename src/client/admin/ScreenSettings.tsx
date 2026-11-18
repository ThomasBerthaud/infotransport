import type { Config } from '../../shared/model.js';

type Screen = Config['screen'];

export function ScreenSettings({
  screen,
  onChange,
}: {
  screen: Screen;
  onChange: (screen: Screen) => void;
}) {
  return (
    <div className="settings-groups">
      <section className="settings-group">
        <h3>Disposition des blocs</h3>
        <div className="fields-grid">
          {(['columns', 'rows'] as const).map((key) => (
            <label className="field" key={key}>
              {key === 'columns' ? 'Colonnes' : 'Lignes'}
              <select
                value={screen[key]}
                aria-label={key === 'columns' ? 'Colonnes' : 'Lignes'}
                aria-describedby={`screen-${key}-help`}
                onChange={(e) => onChange({ ...screen, [key]: Number(e.target.value) })}
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
          Utilisez la largeur et la hauteur disponibles dans le navigateur de l’écran cible, sans
          ses barres d’outils.
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
                  value={screen[key]}
                  aria-label={key === 'width' ? 'Largeur (pixels)' : 'Hauteur (pixels)'}
                  aria-describedby="screen-dimensions-help"
                  onChange={(e) => onChange({ ...screen, [key]: e.target.valueAsNumber })}
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
              checked={screen.debugDimensions ?? false}
              aria-describedby="screen-debug-help"
              onChange={(e) => onChange({ ...screen, debugDimensions: e.target.checked })}
            />
            Afficher les dimensions réelles
          </label>
          <p className="field-help" id="screen-debug-help">
            Relevez les valeurs dans la vue épurée sur l’écran cible, puis reportez-les ci-dessus.
            L’indicateur apparaît au prochain rafraîchissement après enregistrement.
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
                value={screen.refreshSeconds}
                aria-label="Intervalle (secondes)"
                aria-describedby="screen-refresh-help"
                onChange={(e) => onChange({ ...screen, refreshSeconds: e.target.valueAsNumber })}
              />
              <span aria-hidden="true">s</span>
            </span>
          </label>
          <p className="field-help settings-explanation" id="screen-refresh-help">
            Recharge les deux vues avec les données déjà reçues. La fréquence des appels PRIM se
            règle dans « Réglages communs ».
          </p>
        </div>
      </section>
    </div>
  );
}
