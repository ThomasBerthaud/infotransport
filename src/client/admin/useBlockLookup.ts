import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Block, CatalogLine, CatalogPlace, Dashboard, Discovery } from '../../shared/model.js';
import type { Suggestion } from '../Autocomplete.js';
import { api } from '../api.js';
import {
  destinationSuggestions,
  directionKey,
  directionSuggestions,
  lineSuggestions,
  stopSuggestions,
} from './blocks.js';

const DAY_MS = 86_400_000;
/** Matches the server's discovery cache: a refetch sooner would not reach PRIM anyway. */
const DISCOVERY_STALE_MS = 180_000;
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Stop, line and direction lookups of one block editor: local catalog searches,
 * PRIM direction discovery, and the text shown in each autocomplete field.
 */
export function useBlockLookup(
  block: Block,
  mode: Dashboard['mode'],
  onChange: (block: Block) => void,
) {
  const [stopQuery, setStopQuery] = useState(block.monitoringRef ? block.station : '');
  const [lookupQuery, setLookupQuery] = useState(stopQuery);
  const [debounced, setDebounced] = useState(stopQuery);
  const [lineQuery, setLineQuery] = useState(block.lineRef ? block.line : '');
  const [directionQuery, setDirectionQuery] = useState(
    block.directionRef || block.destinationRef ? block.direction : '',
  );
  const [discoveredRef, setDiscoveredRef] = useState(block.monitoringRef);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(lookupQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [lookupQuery]);
  const search = useQuery({
    queryKey: ['local-stops', debounced],
    queryFn: ({ signal }) =>
      api<CatalogPlace[]>(`/api/stops?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: debounced.trim().length >= 2,
    staleTime: DAY_MS,
  });
  const lines = useQuery({
    queryKey: ['local-lines', block.monitoringRef],
    queryFn: ({ signal }) =>
      api<CatalogLine[]>(`/api/lines?ref=${encodeURIComponent(block.monitoringRef)}`, { signal }),
    enabled: !!block.monitoringRef,
    staleTime: DAY_MS,
  });
  const discovery = useQuery({
    queryKey: ['discovery', mode, discoveredRef],
    queryFn: ({ signal }) =>
      api<Discovery>(`/api/discover?ref=${encodeURIComponent(discoveredRef)}`, { signal }),
    enabled: !!discoveredRef,
    staleTime: DISCOVERY_STALE_MS,
    retry: false,
  });
  const directions = (discovery.data?.directions || []).filter(
    (direction) => direction.lineRef === block.lineRef,
  );

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
    setStopQuery(place.label);
    setLookupQuery(place.label);
    setLineQuery('');
    setDirectionQuery('');
    setDiscoveredRef(place.monitoringRef);
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
    const found = directions.find((direction) => directionKey(direction) === option.value);
    if (!found) return;
    onChange({
      ...block,
      direction: found.name,
      directionRef: found.directionRef,
      destinationRef: found.destinationRef,
    });
    setDirectionQuery(found.name);
  };
  /** Reloads directions for the manually entered MonitoringRef. */
  const loadDirections = () => {
    if (discoveredRef === block.monitoringRef) void discovery.refetch();
    else setDiscoveredRef(block.monitoringRef);
  };

  return {
    search,
    lines,
    discovery,
    stopQuery,
    lookupPending: search.isFetching || lookupQuery !== debounced,
    typeStop: (value: string) => {
      setStopQuery(value);
      setLookupQuery(value);
    },
    lookup: setLookupQuery,
    lineQuery,
    setLineQuery,
    directionQuery,
    setDirectionQuery,
    stopOptions: stopSuggestions(search.data || []),
    lineOptions: lineSuggestions(lines.data || []),
    directionOptions: directionSuggestions(directions),
    destinationOptions: destinationSuggestions(directions),
    selectStop,
    selectLine,
    selectDirection,
    loadDirections,
  };
}
export type BlockLookup = ReturnType<typeof useBlockLookup>;
