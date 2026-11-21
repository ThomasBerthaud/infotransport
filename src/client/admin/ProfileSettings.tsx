import { useState } from 'react';
import type { Config, Profile, ProfileLocation } from '../../shared/model.js';
import {
  DEFAULT_RADIUS,
  LOCATION_BOUNDS,
  MAX_PROFILES,
  overlappingProfiles,
  parseCoordinates,
} from '../../shared/model.js';
import { Icon } from '../../components/Icon.js';
import { moveBlock as moveItem } from './blocks.js';
import { newProfile, withoutProfile } from './profiles.js';

const RADII = [300, 500, 1000, 2000, 5000];
const radiusLabel = (metres: number) =>
  metres >= 1000 ? `${(metres / 1000).toLocaleString('fr-FR')} km` : `${metres} m`;
const inBounds = ({ lat, lon }: { lat: number; lon: number }) =>
  lat >= LOCATION_BOUNDS.lat[0] &&
  lat <= LOCATION_BOUNDS.lat[1] &&
  lon >= LOCATION_BOUNDS.lon[0] &&
  lon <= LOCATION_BOUNDS.lon[1];
const formatCoordinates = (location?: ProfileLocation) =>
  location ? `${location.lat}, ${location.lon}` : '';
const round = (value: number) => Math.round(value * 1e5) / 1e5;

function LocationFields({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (location: ProfileLocation | undefined) => void;
}) {
  const { location } = profile;
  const [text, setText] = useState(() => formatCoordinates(location));
  const [problem, setProblem] = useState('');
  const [locating, setLocating] = useState(false);
  const secure = typeof window !== 'undefined' && window.isSecureContext && !!navigator.geolocation;
  const id = profile.id;
  const apply = (coordinates: { lat: number; lon: number }) => {
    onChange({
      radius: location?.radius ?? DEFAULT_RADIUS,
      ...(location?.label ? { label: location.label } : {}),
      ...coordinates,
    });
  };
  // Coordinates apply as soon as they are valid; problems are reported on blur, not per keystroke.
  const type = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setProblem('');
      onChange(undefined);
      return;
    }
    const coordinates = parseCoordinates(value);
    if (coordinates && inBounds(coordinates)) {
      setProblem('');
      apply(coordinates);
    }
  };
  const check = () => {
    if (!text.trim()) return;
    const coordinates = parseCoordinates(text);
    if (!coordinates)
      setProblem('Format attendu : latitude, longitude, par exemple 48.8919, 2.2378.');
    else if (!inBounds(coordinates))
      setProblem(
        'Cette position est hors de l’Île-de-France : vérifiez l’ordre latitude, longitude.',
      );
  };
  const useCurrent = () => {
    setLocating(true);
    setProblem('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const coordinates = { lat: round(coords.latitude), lon: round(coords.longitude) };
        setText(formatCoordinates({ ...coordinates, radius: 0 }));
        if (!inBounds(coordinates)) {
          setProblem('Votre position actuelle est hors de l’Île-de-France.');
          return;
        }
        apply(coordinates);
      },
      (error) => {
        setLocating(false);
        setProblem(
          error.code === error.PERMISSION_DENIED
            ? 'Localisation refusée par le navigateur. Saisissez les coordonnées.'
            : 'Position indisponible pour le moment. Réessayez ou saisissez les coordonnées.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };
  const radii = location && !RADII.includes(location.radius) ? [...RADII, location.radius] : RADII;
  return (
    <section className="profile-location" aria-labelledby={`location-title-${id}`}>
      <h4 id={`location-title-${id}`}>Position du profil</h4>
      <p className="field-help">
        Sur la vue détaillée, ce profil s’affiche automatiquement dans ce rayon. Sans position, il
        se choisit à la main.
      </p>
      <div className="fields-grid">
        <label className="field">
          Latitude, longitude
          <input
            value={text}
            inputMode="decimal"
            placeholder="48.8919, 2.2378"
            aria-label="Latitude, longitude"
            aria-describedby={`coordinates-help-${id}${problem ? ` coordinates-error-${id}` : ''}`}
            aria-invalid={!!problem || undefined}
            onChange={(e) => type(e.target.value)}
            onBlur={check}
          />
          <span className="field-help" id={`coordinates-help-${id}`}>
            Collez les coordonnées copiées depuis une carte. Laissez vide pour aucune position.
          </span>
          {problem && (
            <span className="field-error" id={`coordinates-error-${id}`} role="alert">
              {problem}
              {location && ' La position précédente reste enregistrée.'}
            </span>
          )}
        </label>
        <label className="field">
          Rayon
          <select
            value={location?.radius ?? DEFAULT_RADIUS}
            disabled={!location}
            aria-label="Rayon"
            onChange={(e) => location && onChange({ ...location, radius: Number(e.target.value) })}
          >
            {radii.map((radius) => (
              <option key={radius} value={radius}>
                {radiusLabel(radius)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Libellé du lieu (facultatif)
          <input
            maxLength={60}
            value={location?.label ?? ''}
            disabled={!location}
            aria-label="Libellé du lieu"
            onChange={(e) => {
              if (!location) return;
              const { label: _label, ...rest } = location;
              onChange(e.target.value ? { ...rest, label: e.target.value } : rest);
            }}
          />
        </label>
      </div>
      <div className="profile-location-actions">
        {secure ? (
          <button
            type="button"
            className="secondary-button"
            disabled={locating}
            onClick={useCurrent}
          >
            {locating ? 'Localisation…' : 'Utiliser ma position actuelle'}
          </button>
        ) : (
          <span className="field-help">
            « Utiliser ma position actuelle » demande un accès en HTTPS.
          </span>
        )}
        {location && (
          <button
            type="button"
            className="text-button danger"
            onClick={() => {
              setText('');
              setProblem('');
              onChange(undefined);
            }}
          >
            Retirer la position
          </button>
        )}
      </div>
    </section>
  );
}

export function ProfileSettings({
  config,
  selected,
  onChange,
  onSelect,
}: {
  config: Config;
  selected: string;
  onChange: (config: Config) => void;
  onSelect: (id: string) => void;
}) {
  const { profiles } = config;
  const update = (profile: Profile) =>
    onChange({ ...config, profiles: profiles.map((p) => (p.id === profile.id ? profile : p)) });
  const overlaps = overlappingProfiles(config);
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>Profils de stations</h2>
        <span>
          {profiles.length} {profiles.length === 1 ? 'profil' : 'profils'}
        </span>
      </div>
      <p className="section-description">
        Un profil regroupe des blocs et leur grille, par exemple « Maison » et « Travail ». La vue
        épurée affiche toujours le profil par défaut. La vue détaillée choisit le profil le plus
        proche de l’appareil, si sa position est connue, et le profil par défaut sinon.
      </p>
      {overlaps.length > 0 && (
        <div className="layout-warning" aria-live="polite">
          <Icon name="overflow" size={24} />
          <div className="layout-warning-content">
            <strong>Zones qui se chevauchent</strong>
            <ul>
              {overlaps.map(([a, b]) => (
                <li key={`${a.id}-${b.id}`}>
                  « {a.name} » et « {b.name} » : dans la zone commune, le plus proche l’emporte.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {profiles.map((profile, index) => (
        <article
          className="block-editor profile-editor"
          key={profile.id}
          aria-labelledby={`profile-title-${profile.id}`}
          aria-current={profile.id === selected || undefined}
        >
          <div className="editor-top">
            <h3 id={`profile-title-${profile.id}`}>
              {profile.name || 'Profil sans nom'}
              <span>
                {profile.blocks.length} {profile.blocks.length === 1 ? 'bloc' : 'blocs'}
                {profile.location
                  ? ` · ${profile.location.label || 'position définie'} (${radiusLabel(profile.location.radius)})`
                  : ' · sans position'}
              </span>
            </h3>
            <div className="editor-actions">
              {profile.id === selected ? (
                <span className="profile-current">Profil modifié</span>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onSelect(profile.id)}
                  aria-label={`Modifier ses blocs · ${profile.name}`}
                >
                  Modifier ses blocs
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                onClick={() => onChange({ ...config, profiles: moveItem(profiles, index, -1) })}
                disabled={index === 0}
                aria-label={`Monter le profil « ${profile.name} »`}
              >
                <Icon name="up" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => onChange({ ...config, profiles: moveItem(profiles, index, 1) })}
                disabled={index === profiles.length - 1}
                aria-label={`Descendre le profil « ${profile.name} »`}
              >
                <Icon name="down" />
              </button>
              <button
                type="button"
                className="text-button danger"
                disabled={profiles.length === 1}
                onClick={() => {
                  const count = profile.blocks.length;
                  if (
                    count &&
                    !window.confirm(
                      `Supprimer le profil « ${profile.name} » et ses ${count} ${count === 1 ? 'bloc' : 'blocs'} ?`,
                    )
                  )
                    return;
                  onChange(withoutProfile(config, profile.id));
                }}
                aria-label={`Supprimer le profil « ${profile.name} »`}
              >
                Supprimer
              </button>
            </div>
          </div>
          <div className="fields-grid">
            <label className="field">
              Nom
              <input
                required
                maxLength={40}
                value={profile.name}
                aria-label="Nom du profil"
                onChange={(e) => update({ ...profile, name: e.target.value })}
              />
            </label>
            <label className="check-label profile-default">
              <input
                type="radio"
                name="default-profile"
                checked={config.defaultProfileId === profile.id}
                onChange={() => onChange({ ...config, defaultProfileId: profile.id })}
              />
              <span>
                Profil par défaut<span className="visually-hidden"> : {profile.name}</span> ·
                affiché sur la vue épurée
              </span>
            </label>
          </div>
          <LocationFields
            profile={profile}
            onChange={(location) => {
              const { location: _old, ...rest } = profile;
              update(location ? { ...rest, location } : rest);
            }}
          />
        </article>
      ))}
      <button
        type="button"
        className="add-block"
        disabled={profiles.length >= MAX_PROFILES}
        onClick={() => {
          const profile = newProfile(config);
          onChange({ ...config, profiles: [...profiles, profile] });
          onSelect(profile.id);
        }}
      >
        + Ajouter un profil
      </button>
      <p className="field-help">
        Le choix automatique demande d’ouvrir la vue détaillée en HTTPS, comme l’installation de
        l’application. La position de l’appareil reste dans le navigateur. Les blocs de tous les
        profils sont collectés et comptés dans le budget PRIM.
      </p>
    </section>
  );
}
