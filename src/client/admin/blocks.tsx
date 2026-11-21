import type { Block, CatalogLine, CatalogPlace, Discovery, Settings } from '../../shared/model.js';
import { Line } from '../../components/Block.js';
import type { Suggestion } from '../Autocomplete.js';

// Pure helpers behind the block editor, kept apart so they can be tested without a DOM.

const modeNames: Record<string, string> = {
  LocalTrain: 'Train',
  RapidTransit: 'RER',
  Metro: 'Métro',
  Bus: 'Bus',
  Tramway: 'Tramway',
  regionalRail: 'Train régional',
};
const modeName = (mode?: string) => modeNames[mode || ''] || mode;
const details = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

export const stopSuggestions = (places: CatalogPlace[]): Suggestion[] =>
  places.map((place) => ({
    value: place.monitoringRef,
    label: place.label,
    detail: details([
      place.city,
      modeName(place.mode),
      place.lines?.map((line) => line.label).join(', '),
      place.monitoringRef,
    ]),
  }));

export const lineSuggestions = (lines: CatalogLine[]): Suggestion[] =>
  lines.map((line) => ({
    value: line.ref,
    label: line.label,
    visualLabel: (
      <Line
        line={line.label}
        appearance={line.color ? { color: line.color, textColor: line.textColor } : undefined}
      />
    ),
    detail: details([
      modeName(line.mode),
      line.name !== line.label ? line.name : '',
      line.operator,
      line.ref,
    ]),
  }));

export type Direction = Discovery['directions'][number];
export const directionKey = (direction: Direction) =>
  direction.directionRef || direction.destinationRef;

export const directionSuggestions = (directions: Direction[]): Suggestion[] =>
  directions.map((direction) => ({
    value: directionKey(direction),
    label: direction.name,
    detail: directionKey(direction),
  }));

export const destinationSuggestions = (directions: Direction[]): Suggestion[] =>
  directions
    .filter((direction) => !!direction.destinationRef)
    .map((direction) => ({
      value: direction.destinationRef,
      label: direction.name,
      detail: direction.destinationRef,
    }));

/** Sets a block override, or removes it to inherit the common value again. */
export function withOverride<K extends keyof Settings>(
  block: Block,
  key: K,
  value: Settings[K] | undefined,
): Block {
  const overrides = { ...block.overrides };
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  return { ...block, overrides };
}

/** Starts a block schedule from its current effective values, or drops it entirely. */
export function withOwnSchedule(block: Block, effective: Settings, enabled: boolean): Block {
  const { start: _start, end: _end, days: _days, ...overrides } = block.overrides;
  return {
    ...block,
    overrides: enabled
      ? { ...overrides, start: effective.start, end: effective.end, days: [...effective.days] }
      : overrides,
  };
}

export const newBlock = (columns: number): Block => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  station: 'Nouvelle gare',
  line: '?',
  direction: 'Direction à choisir',
  monitoringRef: '',
  lineRef: '',
  directionRef: '',
  destinationRef: '',
  span: columns,
  overrides: {},
});

export function moveBlock<T>(blocks: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export type BudgetLevel = 'unknown' | 'normal' | 'warning' | 'critical' | 'exhausted';
export function budgetLevel(used: number | undefined, limit: number): BudgetLevel {
  if (used === undefined) return 'unknown';
  if (used >= limit) return 'exhausted';
  if (used >= limit * 0.9) return 'critical';
  if (used >= limit * 0.8) return 'warning';
  return 'normal';
}
