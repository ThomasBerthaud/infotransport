import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Config, Dashboard, Profile } from '../shared/model.js';
import {
  defaultProfile,
  MAX_BLOCKS_PER_PROFILE,
  minimalWarnings,
  profileById,
  validateConfig,
} from '../shared/model.js';
import { Icon } from '../components/Icon.js';
import { api } from './api.js';
import { AdminSidebar, type Diagnostic } from './admin/AdminSidebar.js';
import { BlockEditor } from './admin/BlockEditor.js';
import { moveBlock, newBlock } from './admin/blocks.js';
import { DefaultSettings } from './admin/fields.js';
import { Preview } from './admin/Preview.js';
import { ProfileSettings } from './admin/ProfileSettings.js';
import { moveBlockToProfile } from './admin/profiles.js';
import { ScreenSettings } from './admin/ScreenSettings.js';

const STATUS_REFRESH_MS = 30_000;

/** A readable validation message, naming the profile concerned when there is one. */
function describeError(error: unknown, draft: Config): string {
  if (!(error instanceof z.ZodError)) return (error as Error).message;
  return error.issues
    .map((issue) => {
      const [root, index, ...rest] = issue.path;
      if (root === 'profiles' && typeof index === 'number') {
        const name = draft.profiles[index]?.name.trim();
        const where = name ? `Profil « ${name} »` : `Profil n° ${index + 1}`;
        return `${where} · ${rest.join('.') || 'profil'} : ${issue.message}`;
      }
      return issue.path.length ? `${issue.path.join('.')} : ${issue.message}` : issue.message;
    })
    .join(' · ');
}

const tabs = [
  ['blocks', 'Blocs suivis'],
  ['profiles', 'Profils'],
  ['defaults', 'Réglages communs'],
  ['screen', 'Affichage & aperçu'],
] as const;
type Tab = (typeof tabs)[number][0];

function Tabs({ tab, onSelect }: { tab: Tab; onSelect: (tab: Tab) => void }) {
  const keys = tabs.map(([key]) => key);
  return (
    <div className="admin-tabs" role="tablist" aria-label="Catégories de réglages">
      {tabs.map(([key, label]) => (
        <button
          type="button"
          key={key}
          role="tab"
          id={`tab-${key}`}
          aria-controls="settings-panel"
          aria-selected={tab === key}
          tabIndex={tab === key ? 0 : -1}
          onKeyDown={(event) => {
            const current = keys.indexOf(tab);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? keys.length - 1
                  : event.key === 'ArrowRight'
                    ? (current + 1) % keys.length
                    : event.key === 'ArrowLeft'
                      ? (current + keys.length - 1) % keys.length
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onSelect(keys[next]!);
            document.getElementById(`tab-${keys[next]}`)?.focus();
          }}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LayoutWarnings({ warnings }: { warnings: string[] }) {
  return (
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
  );
}

export function Admin({ dashboard }: { dashboard: Dashboard }) {
  const [draft, setDraft] = useState<Config>(() => structuredClone(dashboard.config));
  const [selectedId, setSelectedId] = useState(() => defaultProfile(dashboard.config).id);
  const profile = profileById(draft, selectedId) ?? defaultProfile(draft);
  const [measurement, setMeasurement] = useState<{
    config: Config;
    profileId: string;
    ids: string[];
  }>();
  const onMeasure = useCallback(
    (ids: string[]) => setMeasurement({ config: draft, profileId: profile.id, ids }),
    [draft, profile.id],
  );
  const [tab, setTab] = useState<Tab>('blocks');
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => api<Diagnostic>('/api/status', { signal }),
    refetchInterval: dashboard.paused ? false : STATUS_REFRESH_MS,
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
  const updateProfile = (next: Profile) =>
    update({ ...draft, profiles: draft.profiles.map((p) => (p.id === next.id ? next : p)) });
  const blocks = profile.blocks;
  let invalid = '';
  let warnings: string[] = [];
  try {
    const valid = validateConfig(draft);
    warnings = minimalWarnings(
      valid,
      measurement?.config === draft && measurement.profileId === profile.id ? measurement.ids : [],
      profileById(valid, profile.id),
    );
  } catch (error) {
    invalid = describeError(error, draft);
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
          <Preview
            config={draft}
            profile={profile}
            dashboard={dashboard}
            onMeasure={onMeasure}
            hidden
          />
        )}
        <div>
          <div className="profile-switch">
            <label className="field">
              Profil modifié
              <select
                value={profile.id}
                aria-describedby="profile-switch-help"
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {draft.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Profil sans nom'}
                    {p.id === draft.defaultProfileId ? ' · par défaut' : ''}
                  </option>
                ))}
              </select>
              <span className="field-help" id="profile-switch-help">
                Les blocs, la grille et l’aperçu portent sur ce profil. Gérez les profils dans «
                Profils ».
              </span>
            </label>
          </div>
          <Tabs tab={tab} onSelect={setTab} />
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
                  <h2>Vos gares et directions · {profile.name || 'Profil sans nom'}</h2>
                  <span>
                    {blocks.length} {blocks.length === 1 ? 'bloc' : 'blocs'}
                  </span>
                </div>
                <p className="section-description">
                  Un bloc suit une gare, une ligne et une direction. Les flèches changent l’ordre
                  d’affichage.
                </p>
                {blocks.map((block, index) => (
                  <BlockEditor
                    key={block.id}
                    block={block}
                    config={draft}
                    mode={dashboard.mode}
                    savedView={dashboard.blocks.find((view) => view.block.id === block.id)}
                    index={index}
                    count={blocks.length}
                    columns={profile.grid.columns}
                    otherProfiles={draft.profiles.filter(
                      (p) => p.id !== profile.id && p.blocks.length < MAX_BLOCKS_PER_PROFILE,
                    )}
                    onChange={(b) =>
                      updateProfile({
                        ...profile,
                        blocks: blocks.map((old) => (old.id === b.id ? b : old)),
                      })
                    }
                    onMove={(delta) =>
                      updateProfile({ ...profile, blocks: moveBlock(blocks, index, delta) })
                    }
                    onDelete={() =>
                      updateProfile({ ...profile, blocks: blocks.filter((b) => b.id !== block.id) })
                    }
                    onMoveToProfile={(target) =>
                      update(moveBlockToProfile(draft, block.id, target))
                    }
                  />
                ))}
                <button
                  type="button"
                  className="add-block"
                  onClick={() =>
                    updateProfile({
                      ...profile,
                      blocks: [...blocks, newBlock(profile.grid.columns)],
                    })
                  }
                  disabled={blocks.length >= MAX_BLOCKS_PER_PROFILE}
                >
                  + Ajouter un bloc
                </button>
              </>
            )}
            {tab === 'profiles' && (
              <ProfileSettings
                config={draft}
                selected={profile.id}
                onChange={update}
                onSelect={setSelectedId}
              />
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
                  l’aperçu avant d’enregistrer. L’écran épuré affiche toujours le profil par défaut
                  {profile.id === draft.defaultProfileId
                    ? '.'
                    : ` : l’aperçu montre « ${profile.name} », qui n’y apparaîtra pas tant qu’il n’est pas le profil par défaut.`}
                </p>
                <ScreenSettings
                  screen={draft.screen}
                  grid={profile.grid}
                  profileName={profile.name || 'Profil sans nom'}
                  onChange={(screen) => update({ ...draft, screen })}
                  onGridChange={(grid) => updateProfile({ ...profile, grid })}
                />
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
                  <Preview
                    config={draft}
                    profile={profile}
                    dashboard={dashboard}
                    onMeasure={onMeasure}
                  />
                </section>
              </section>
            )}
            <div className="save-bar">
              {warnings.length > 0 && <LayoutWarnings warnings={warnings} />}
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
        <AdminSidebar dashboard={dashboard} draft={draft} status={status} />
      </div>
    </>
  );
}
