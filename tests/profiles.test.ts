import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allBlocks,
  chooseProfile,
  dashboardForProfile,
  demoConfig,
  distanceMeters,
  estimatedCallsByApi,
  initialConfig,
  minimalWarnings,
  overlappingProfiles,
  parseCoordinates,
  validateConfig,
  type Block,
  type Config,
  type Dashboard,
} from '../src/shared/model.js';
import { moveBlockToProfile, newProfile, withoutProfile } from '../src/client/admin/profiles.js';

const block = (id: string, patch: Partial<Block> = {}): Block => ({
  id,
  station: 'A',
  line: 'L',
  direction: 'D',
  monitoringRef: 'STIF:StopArea:SP:1:',
  lineRef: 'STIF:Line::C01740:',
  directionRef: 'aller',
  destinationRef: '',
  span: 1,
  overrides: {},
  ...patch,
});
const LA_DEFENSE = { lat: 48.8919, lon: 2.2378 };
const SAINT_LAZARE = { lat: 48.8763, lon: 2.3253 };
const config = (): Config => structuredClone(demoConfig);

test('a v1 configuration becomes one default profile with the same blocks and grid', () => {
  const blocks = [block('a', { span: 2 }), block('b')];
  const migrated = validateConfig({
    version: 1,
    defaults: initialConfig.defaults,
    screen: {
      width: 1024,
      height: 768,
      refreshSeconds: 30,
      columns: 3,
      rows: 4,
      debugDimensions: true,
    },
    blocks,
  });
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.screen, {
    width: 1024,
    height: 768,
    refreshSeconds: 30,
    debugDimensions: true,
  });
  assert.equal(migrated.defaultProfileId, 'principal');
  assert.deepEqual(migrated.profiles, [
    { id: 'principal', name: 'Principal', grid: { columns: 3, rows: 4 }, blocks },
  ]);
  // Same collection as before the migration.
  assert.deepEqual(
    estimatedCallsByApi(migrated),
    estimatedCallsByApi({ ...migrated, profiles: [{ ...migrated.profiles[0], blocks }] }),
  );
  // Rows are derived from the profile's blocks when absent.
  const derived = validateConfig({
    ...migrated,
    profiles: [{ ...migrated.profiles[0], grid: { columns: 1 } }],
  });
  assert.equal(derived.profiles[0].grid.rows, 2);
});

test('profile rules: unique ids and names, existing default, bounded position and radius', () => {
  assert.doesNotThrow(() => validateConfig(config()));
  const sameBlock = config();
  sameBlock.profiles[1].blocks.push({ ...sameBlock.profiles[0].blocks[0] });
  assert.throws(() => validateConfig(sameBlock), /tous profils confondus/);
  const sameId = config();
  sameId.profiles[1].id = sameId.profiles[0].id;
  assert.throws(() => validateConfig(sameId), /profil doit avoir un identifiant unique/);
  const sameName = config();
  sameName.profiles[1].name = ' la défense ';
  assert.throws(() => validateConfig(sameName), /même nom/);
  const missing = config();
  missing.defaultProfileId = 'nope';
  assert.throws(() => validateConfig(missing), /profil par défaut/);
  const empty = config();
  empty.profiles = [];
  assert.throws(() => validateConfig(empty));
  const tooMany = config();
  tooMany.profiles = Array.from({ length: 9 }, (_, i) => ({
    ...tooMany.profiles[0],
    id: `p${i}`,
    name: `P${i}`,
    blocks: [],
  }));
  assert.throws(() => validateConfig(tooMany));
  for (const location of [
    { lat: 45.76, lon: 4.83 },
    { lat: 2.24, lon: 48.89 },
    { ...LA_DEFENSE, radius: 50 },
    { ...LA_DEFENSE, radius: 20001 },
  ]) {
    const invalid = config();
    invalid.profiles[0].location = { radius: 1000, ...location };
    assert.throws(() => validateConfig(invalid), JSON.stringify(location));
  }
  const noRadius = config();
  noRadius.profiles[0].location = LA_DEFENSE as Config['profiles'][0]['location'];
  assert.equal(validateConfig(noRadius).profiles[0].location?.radius, 1000);
});

test('blocks of every profile are collected once and counted in the budget', () => {
  const c = config();
  assert.deepEqual(
    allBlocks(c).map((b) => b.id),
    ['la-defense-l', 'la-defense-u', 'saint-lazare-l'],
  );
  c.profiles[0].blocks = [block('a', { monitoringRef: 'STIF:StopArea:SP:1:' })];
  c.profiles[1].blocks = [block('b', { monitoringRef: 'STIF:StopArea:SP:2:' })];
  const single = { ...c, profiles: [c.profiles[0]] };
  const shared = structuredClone(c);
  // Same stop and line in another profile: nothing more to collect.
  shared.profiles[1].blocks = [{ ...c.profiles[0].blocks[0], id: 'copy', directionRef: 'retour' }];
  assert.deepEqual(estimatedCallsByApi(shared), estimatedCallsByApi(single));
  assert.ok(
    estimatedCallsByApi(c)['stop-monitoring'] > estimatedCallsByApi(single)['stop-monitoring'],
  );
});

test('minimal warnings use the grid of the profile given, the default one otherwise', () => {
  const c = validateConfig(config());
  c.profiles[1].grid = { columns: 1, rows: 1 };
  assert.deepEqual(minimalWarnings(c), []);
  assert.match(minimalWarnings(c, [], c.profiles[1]).join(' '), /occupe 2 colonnes/);
});

test('chooseProfile: manual first, then the nearest profile in range, then the default', () => {
  const c = config();
  assert.deepEqual(
    [chooseProfile(c).profile.id, chooseProfile(c).reason],
    ['la-defense', 'default'],
  );
  assert.equal(chooseProfile(c, SAINT_LAZARE).profile.id, 'saint-lazare');
  assert.equal(chooseProfile(c, SAINT_LAZARE).reason, 'nearest');
  assert.equal(chooseProfile(c, LA_DEFENSE).profile.id, 'la-defense');
  // Manual choice wins, an unknown one is ignored.
  assert.deepEqual(
    [
      chooseProfile(c, LA_DEFENSE, 'saint-lazare').profile.id,
      chooseProfile(c, LA_DEFENSE, 'saint-lazare').reason,
    ],
    ['saint-lazare', 'manual'],
  );
  assert.equal(chooseProfile(c, SAINT_LAZARE, 'nope').reason, 'nearest');
  // Out of every radius: default profile.
  const versailles = { lat: 48.8049, lon: 2.1204 };
  assert.equal(chooseProfile(c, versailles).reason, 'default');
  c.defaultProfileId = 'saint-lazare';
  assert.equal(chooseProfile(c, versailles).profile.id, 'saint-lazare');
  // An imprecise position is not used.
  assert.equal(chooseProfile(c, { ...LA_DEFENSE, accuracy: 2500 }).reason, 'default');
  assert.equal(chooseProfile(c, { ...LA_DEFENSE, accuracy: 2000 }).profile.id, 'la-defense');
  // Overlapping areas: the nearest wins; on a tie, profile order decides.
  c.profiles[0].location = { ...LA_DEFENSE, radius: 20000 };
  c.profiles[1].location = { ...SAINT_LAZARE, radius: 20000 };
  assert.equal(chooseProfile(c, { lat: 48.877, lon: 2.32 }).profile.id, 'saint-lazare');
  c.profiles[1].location = { ...LA_DEFENSE, radius: 20000 };
  assert.equal(chooseProfile(c, LA_DEFENSE).profile.id, 'la-defense');
  // Profiles without position are never chosen automatically.
  delete c.profiles[0].location;
  delete c.profiles[1].location;
  assert.equal(chooseProfile(c, LA_DEFENSE).reason, 'default');
});

test('distances, overlaps and pasted coordinates', () => {
  const d = distanceMeters(LA_DEFENSE, SAINT_LAZARE);
  assert.ok(d > 6000 && d < 7000, String(d));
  assert.equal(distanceMeters(LA_DEFENSE, LA_DEFENSE), 0);
  const c = config();
  assert.deepEqual(overlappingProfiles(c), []);
  c.profiles[0].location!.radius = 5000;
  c.profiles[1].location!.radius = 2000;
  assert.deepEqual(
    overlappingProfiles(c).map(([a, b]) => [a.id, b.id]),
    [['la-defense', 'saint-lazare']],
  );
  assert.deepEqual(parseCoordinates('48.89, 2.24'), { lat: 48.89, lon: 2.24 });
  assert.deepEqual(parseCoordinates(' 48,8919 2,2378 '), { lat: 48.8919, lon: 2.2378 });
  assert.deepEqual(parseCoordinates('48.89;2.24'), { lat: 48.89, lon: 2.24 });
  assert.equal(parseCoordinates('La Défense'), undefined);
  assert.equal(parseCoordinates('48.89'), undefined);
});

test('the dashboard is filtered to one profile', () => {
  const dashboard = {
    blocks: [
      { profileId: 'a', block: block('1') },
      { profileId: 'b', block: block('2') },
    ],
  } as unknown as Dashboard;
  assert.deepEqual(
    dashboardForProfile(dashboard, 'b').blocks.map((v) => v.block.id),
    ['2'],
  );
});

test('admin helpers add, remove and move between profiles', () => {
  const c = config();
  const added = newProfile(c);
  assert.equal(added.name, 'Profil 3');
  assert.deepEqual(added.blocks, []);
  const withAdded = { ...c, profiles: [...c.profiles, added] };
  assert.doesNotThrow(() => validateConfig(withAdded));
  assert.notEqual(newProfile(withAdded).id, added.id);
  const removed = withoutProfile(c, 'la-defense');
  assert.equal(removed.defaultProfileId, 'saint-lazare');
  assert.deepEqual(
    removed.profiles.map((p) => p.id),
    ['saint-lazare'],
  );
  assert.equal(withoutProfile(removed, 'saint-lazare'), removed);
  const moved = moveBlockToProfile(c, 'la-defense-u', 'saint-lazare');
  assert.deepEqual(
    moved.profiles.map((p) => p.blocks.map((b) => b.id)),
    [['la-defense-l'], ['saint-lazare-l', 'la-defense-u']],
  );
  assert.doesNotThrow(() => validateConfig(moved));
  assert.equal(moveBlockToProfile(c, 'nope', 'saint-lazare'), c);
});
