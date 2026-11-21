import type { Config, Profile } from '../../shared/model.js';

// Pure helpers behind the profile settings, kept apart so they can be tested without a DOM.

/** A new empty profile with a name no other profile uses. */
export function newProfile(config: Pick<Config, 'profiles'>): Profile {
  const names = new Set(config.profiles.map((p) => p.name.toLocaleLowerCase('fr')));
  let n = config.profiles.length + 1;
  while (names.has(`profil ${n}`)) n++;
  return {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: `Profil ${n}`,
    grid: { columns: 2, rows: 2 },
    blocks: [],
  };
}

/** Removes a profile; the first remaining one becomes the default if needed. */
export function withoutProfile(config: Config, id: string): Config {
  const profiles = config.profiles.filter((p) => p.id !== id);
  if (!profiles.length) return config;
  return {
    ...config,
    profiles,
    defaultProfileId: config.defaultProfileId === id ? profiles[0]!.id : config.defaultProfileId,
  };
}

/** Moves a block to the end of another profile, keeping its id and settings. */
export function moveBlockToProfile(config: Config, blockId: string, target: string): Config {
  const block = config.profiles.flatMap((p) => p.blocks).find((b) => b.id === blockId);
  if (!block || !config.profiles.some((p) => p.id === target)) return config;
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id === target
        ? { ...p, blocks: [...p.blocks.filter((b) => b.id !== blockId), block] }
        : { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) },
    ),
  };
}
