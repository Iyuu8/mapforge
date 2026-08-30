import { useEffect, useState } from 'react';
import { ArrowUpDown, LocateFixed, Milestone, Route } from 'lucide-react';
import * as routeApi from '../../api/routeApi';
import * as searchApi from '../../api/searchApi';
import { groupRouteByFloor } from '../../domain/mapModel';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import StatusMessage from '../common/StatusMessage';

export function LocationSearchBox({ label, organizationId, selected, onSelect, onLocationSelected }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    let active = true;

    async function runSearch() {
      if (debouncedQuery.trim().length < 2) {
        setResults([]);
        setError(null);
        setSearched(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await searchApi.searchLocations({
          query: debouncedQuery.trim(),
          organizationId,
        });
        if (active) {
          setResults(Array.isArray(data) ? data : []);
          setSearched(true);
        }
      } catch (apiError) {
        if (active) setError(apiError);
      } finally {
        if (active) setLoading(false);
      }
    }

    runSearch();
    return () => {
      active = false;
    };
  }, [debouncedQuery, organizationId]);

  return (
    <div className="locationSearchBox">
      <label>
        {label}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selected ? `${selected.identifier || selected.externalIdentifier} - ${selected.name}` : 'Search room, entrance, facility'}
        />
      </label>
      {loading ? <small className="searchMeta">Searching...</small> : null}
      {error ? <small className="searchMeta errorText">{error.message}</small> : null}
      {!loading && !error && searched && results.length === 0 ? (
        <small className="searchMeta">No results in this map.</small>
      ) : null}
      {!loading && !error && (!searched || results.length > 0) ? <small className="searchMeta searchMetaSpacer"> </small> : null}
      {selected ? (
        <button className="selectedLocation" type="button" onClick={() => onSelect(null)}>
          <LocateFixed size={14} />
          <span>{selected.identifier || selected.externalIdentifier || selected.id}</span>
          <strong>{selected.name}</strong>
        </button>
      ) : null}
      {results.length > 0 ? (
        <div className="searchResults">
          {results.map((result) => (
            <button
              type="button"
              key={result.id}
              onClick={() => {
                onSelect(result);
                onLocationSelected?.(result);
                setQuery('');
                setResults([]);
              }}
            >
              <span>{result.identifier || result.externalIdentifier || result.id}</span>
              <strong>{result.name}</strong>
              <small>{result.type}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function RoutePlanner({
  organizationId,
  floors,
  currentRoute,
  setCurrentRoute,
  onLocationSelected,
  onRouteSegmentSelected,
  source,
  setSource,
  destination,
  setDestination,
}) {
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleRoute() {
    if (!source || !destination) return;

    setLoading(true);
    setError(null);
    try {
      const route = await routeApi.findRoute({
        sourceId: source.id,
        destinationId: destination.id,
        accessibleOnly,
      });
      setCurrentRoute(route);
      if (route.path?.[0]) {
        onLocationSelected?.(route.path[0]);
      }
    } catch (apiError) {
      setCurrentRoute(null);
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }

  const segments = groupRouteByFloor(currentRoute, floors);

  return (
    <aside className="routePanel">
      <div className="panelHeader">
        <Route size={18} />
        <h2>Route</h2>
      </div>
      <LocationSearchBox
        label="Origin"
        organizationId={organizationId}
        selected={source}
        onSelect={setSource}
        onLocationSelected={onLocationSelected}
      />
      <LocationSearchBox
        label="Destination"
        organizationId={organizationId}
        selected={destination}
        onSelect={setDestination}
        onLocationSelected={onLocationSelected}
      />
      <button
        className="button buttonGhost swapRouteButton"
        type="button"
        disabled={!source && !destination}
        onClick={() => {
          setSource(destination);
          setDestination(source);
        }}
      >
        <ArrowUpDown size={16} />
        Swap
      </button>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={accessibleOnly}
          onChange={(event) => setAccessibleOnly(event.target.checked)}
        />
        Accessible paths only
      </label>
      <button
        className="button buttonPrimary"
        type="button"
        onClick={handleRoute}
        disabled={!source || !destination || loading}
      >
        <Milestone size={17} />
        {loading ? 'Finding route...' : 'Find route'}
      </button>
      {error ? (
        <StatusMessage title={error.code || 'Route failed'} tone="error">
          {error.status === 404
            ? accessibleOnly
              ? 'No accessible route found, but a standard route may exist.'
              : 'No route found between these two points.'
            : error.message}
          {error.status === 404 && accessibleOnly ? (
            <button className="segmentJumpButton" type="button" onClick={() => setAccessibleOnly(false)}>
              Try standard route
            </button>
          ) : null}
        </StatusMessage>
      ) : null}
      {currentRoute ? (
        <div className="routeResult">
          <strong>{currentRoute.totalDistance}m total</strong>
          {segments.map((segment) => (
            <section key={`${segment.floorId}-${segment.nodes[0]?.id}`}>
              <h3>{segment.floorName}</h3>
              <p>{segment.nodes.map((node) => node.identifier || node.name).join(' -> ')}</p>
              <button
                className="segmentJumpButton"
                type="button"
                onClick={() => onRouteSegmentSelected?.(segment)}
              >
                Show this segment
              </button>
            </section>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
