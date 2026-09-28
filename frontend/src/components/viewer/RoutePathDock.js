import React from 'react';
import { ArrowRight, Layers, Route, X } from 'lucide-react';

export default function RoutePathDock({
  route,
  floors = [],
  buildings = [],
  onSelectNode,
  onClearRoute,
}) {
  if (!route || !route.path || route.path.length < 2) return null;

  const floorMap = new Map((floors || []).map((f) => [Number(f.id), f]));
  const buildingMap = new Map((buildings || []).map((b) => [Number(b.id), b]));

  const enrichedPath = route.path.map((node) => {
    const floor = floorMap.get(Number(node.floorId));
    const floorNumber = node.floorNumber ?? floor?.floorNumber ?? 0;
    const floorName = node.floorName ?? floor?.name ?? `Level ${floorNumber}`;
    const buildingId = node.buildingId ?? floor?.buildingId;
    const building = buildingMap.get(Number(buildingId));
    const buildingName = node.buildingName ?? building?.name ?? 'Building';

    return {
      ...node,
      displayName: node.name || node.identifier || `Node ${node.id}`,
      floorNumber,
      floorName,
      buildingId,
      buildingName,
    };
  });

  return (
    <div className="routePathDock" aria-label="Route waypoints dock">
      <div className="routePathDockHeader">
        <div className="routePathDockMeta">
          <Route size={15} className="routeMetaIcon" />
          <strong className="routeDistanceText">{route.totalDistance}m total</strong>
          <span className="routePointsCount">({enrichedPath.length} steps)</span>
        </div>
        {onClearRoute && (
          <button
            type="button"
            className="routeDockCloseBtn"
            onClick={onClearRoute}
            title="Clear route"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="routePathScrollTrack">
        {enrichedPath.map((node, i) => {
          const prev = i > 0 ? enrichedPath[i - 1] : null;
          const next = i < enrichedPath.length - 1 ? enrichedPath[i + 1] : null;

          const prevFloorChange = prev && (
            Number(prev.floorId) !== Number(node.floorId) ||
            Number(prev.floorNumber) !== Number(node.floorNumber) ||
            Number(prev.buildingId) !== Number(node.buildingId)
          );
          const nextFloorChange = next && (
            Number(next.floorId) !== Number(node.floorId) ||
            Number(next.floorNumber) !== Number(node.floorNumber) ||
            Number(next.buildingId) !== Number(node.buildingId)
          );
          const isFloorTransition = Boolean(prevFloorChange || nextFloorChange);

          const isStart = i === 0;
          const isEnd = i === enrichedPath.length - 1;

          return (
            <React.Fragment key={`dock-node-${node.id}-${i}`}>
              <div
                className={`routePathNodeItem ${isStart ? 'isStart' : ''} ${isEnd ? 'isEnd' : ''} ${isFloorTransition ? 'isTransitionNode' : ''}`}
                onClick={() => onSelectNode?.(node.id)}
                role="button"
                tabIndex={0}
                title={`Floor: ${node.floorName} (${node.buildingName})`}
              >
                <span className="routeNodeDot" />
                <span className="routeNodeName">{node.displayName}</span>

                {isFloorTransition && (
                  <span className="routeFloorBadge" title={`${node.buildingName} - Level ${node.floorNumber}`}>
                    <Layers size={10} />
                    <span>Lvl {node.floorNumber}</span>
                  </span>
                )}
              </div>

              {next && (
                <div className={`routePathConnector ${nextFloorChange ? 'isFloorChangeConnector' : ''}`}>
                  {nextFloorChange ? (
                    <div className="floorChangeBadge" title={`Transition from Level ${node.floorNumber} to Level ${next.floorNumber}`}>
                      <Layers size={11} />
                      <span>
                        L{node.floorNumber} &rarr; L{next.floorNumber}
                      </span>
                    </div>
                  ) : (
                    <ArrowRight size={13} className="routeStepArrow" />
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
