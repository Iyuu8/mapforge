# MapForge Frontend Phase Notes

## Phase Plan

1. **Phase 1: Application shell, authentication, and organization entry.**
   Establish the API client, session boot, landing page, login flow, route guard, and API-backed organization picker.
2. **Phase 2: Shared map model and public viewer.**
   Load `/api/map/{id}?type=organization`, render buildings/floors/nodes/edges, support floor switching, node inspection, search, and route display.
3. **Phase 3: Admin editor core.**
   Add the editor shell, layers, inspector, building/floor creation, node CRUD, edge CRUD, drag-to-update, publish feedback, and guarded deletes.
4. **Phase 4: Geometry, reference images, history, and readiness hardening.**
   Add building/floor geometry editing, tracing image upload/update, cross-floor polish, undo/redo replay, stronger loading/error states, responsive polish, and production build checks.

## Backend Contract Audit

- Auth is cookie-based for browser clients. Login is `POST /api/login_check` with `{ email, password }`, and the JWT is returned as the `AUTH_BEARER` HTTP-only cookie. `GET /api/user` returns guest state with HTTP 200 when no user is authenticated.
- Token refresh exists at `POST /api/token/refresh`; logout is `POST /api/logout`.
- Organizations: `GET /api/organizations`, `POST /api/organizations`, `GET/PUT/PATCH/DELETE /api/organizations/{id}`, `GET /api/organizations/{id}/buildings`, `POST /api/organizations/{id}/publish`.
- Full graph map payload: `GET /api/map/{id}?type=organization|building`.
- Buildings: `POST /api/buildings`, `GET/PUT/DELETE /api/buildings/{id}`, `POST /api/buildings/{id}/publish`.
- Floors: `POST /api/floors`, `GET/PUT/DELETE /api/floors/{id}`.
- Nodes: `POST /api/nodes`, `GET/PUT/DELETE /api/nodes/{id}`.
- Edges: `POST /api/edges`, `PUT/PATCH/DELETE /api/edges/{id}`.
- Search: `GET /api/locations/search?q=...&organizationId=...` or `buildingId=...`.
- Routing: `GET /api/routes/find?sourceId=...&destinationId=...&accessibleOnly=false`.
- Media upload: `POST /api/media/upload` with multipart `file`.

## Phase 1 Completed

Implemented:

- API client with `REACT_APP_API_URL`, `withCredentials`, web client header, error normalization, and one refresh retry for 401 responses.
- Auth context with boot-time session check, login, logout, admin role detection, and public guest fallback.
- React Router routes for landing, login, public organization picker, admin organization picker, and placeholders for viewer/editor phases.
- Landing page with separate Browse and Admin Sign In entry paths.
- Login page using the real cookie-based backend flow.
- Organization picker using the real organization list/create/publish endpoints.
- SPA fallback via `public/_redirects`.

Problems faced:

- The planning document requested React 18, but the existing frontend already has React 19.2.8 in `package.json` and lockfile. I preserved the existing installed stack instead of downgrading during this phase.
- The existing `react-router-dom@7.18.2` built successfully but failed under CRA/Jest because it imports `react-router/dom`. The frontend now uses `react-router-dom@6.30.1`, which matches the routing APIs used here and works with `react-scripts`.
- There is no explicit frontend role bootstrap endpoint named "session"; the real endpoint is `GET /api/user`, and unauthenticated users get HTTP 200 with guest roles. The auth context was adapted to that shape.
- `POST /api/organizations/{id}/publish` can return per-building results with HTTP 422 when validation fails, so the organization picker keeps those details visible instead of reducing them to a generic error.
- The editor/viewer routes are intentionally placeholders in this phase so the frontend remains incremental instead of attempting the full canvas/editor at once.

## CORS Integration

Implemented:

- Updated `backend/config/packages/nelmio_cors.yaml` to allow credentialed browser requests so the `AUTH_BEARER` and refresh cookies can work across the CRA frontend and Symfony backend origins.
- Added `X-Client-Type` to allowed request headers because the frontend login client sends `X-Client-Type: web`.
- Kept the existing `CORS_ALLOW_ORIGIN` environment pattern, which already permits localhost and 127.0.0.1 on any port.

Problems faced:

- CORS was partly present through Nelmio, but cookie auth would fail without `allow_credentials: true`.
- The backend login listener depends on `X-Client-Type`, so preflight requests also need that header explicitly allowed.

## Phase 2 Completed

Implemented:

- Added map, search, and route API modules.
- Added `MapContext` for organization, buildings, floors, active building/floor, selected node, current route, loading, and errors.
- Added pure map-model helpers for normalizing backend payloads, parsing geometry, deriving visible floor edges, indexing nodes, deduplicating route highlights, and grouping route results by floor.
- Replaced `/maps/:organizationId` placeholder with a public viewer.
- Rebuilt the public viewer canvas with `react-konva` instead of React Flow. The viewer now renders a fixed organization coordinate plane using `canvasWidth` and `canvasHeight`, draws building polygons from backend `geometry`, draws current-floor edges and nodes at exact backend `xCoord`/`yCoord` positions, and allows only stage-level pan/zoom/select interactions.
- Added selectable building polygons and selectable nodes. Viewers can pan with cursor/touch and zoom with wheel/buttons, but cannot drag or mutate map objects.
- Added public viewer layout with building/floor sidebar, top search, selected-location summary, route calculation, accessible-only toggle, route highlighting, and multi-floor route segments.
- Search results now switch to the correct floor and pan to the selected node coordinate.
- Selected nodes can be used as route origin/destination.
- Corrected building selection semantics: choosing a building now highlights its polygon and reveals its floors; it does not filter the canvas down to that building. The loaded organization map remains the source for the whole visible map.
- Corrected floor semantics: selecting a floor controls the visible floor number/level. The canvas renders all buildings plus all nodes and edges belonging to that selected level across the whole organization.
- Added GeoJSON polygon unwrapping for building, floor, and node geometry such as `{ "type": "Polygon", "coordinates": [[[x, y], ...]] }`.
- Added node geometry borders. Every node is still represented by a dot at `xCoord`/`yCoord`; if `geometry` exists, its outline is drawn around the dot.
- Added an explicit coordinate mapping utility that converts between backend map coordinates and screen coordinates through the current pan/zoom transform. The viewer uses this when fitting content and jumping to search/route nodes.
- The viewport now fits actual map content bounds derived from building geometry, floor geometry, node geometry, and node coordinates, instead of opening on a huge mostly empty canvas.
- Public viewer fetches only through backend endpoints, preserving backend draft filtering for anonymous users.

Problems faced:

- The first implementation used React Flow, which was the wrong abstraction: it rendered the data as a graph/flow chart and could produce a black, empty-looking viewport instead of a stable map. React Flow has been removed from the code and dependency tree.
- `GET /api/map/{organizationId}?type=organization` originally returned floors without `buildingId`, which prevented correct single-request organization loading and client-side building/floor switching. I fixed the backend serializer to include `buildingId`, `buildingName`, and floor `geometry` in each serialized floor.
- The public viewer now uses the full organization map endpoint once, plus `GET /api/organizations/{id}` for organization metadata/canvas dimensions. It no longer fetches each building map separately during Phase 2 browsing.
- `react-konva`/Konva builds correctly, but CRA/Jest cannot parse Konva's ESM package from `node_modules` in the simple landing-page test. The test mocks `react-konva`; runtime code still uses the real package.
- The first published building can have no floors. The map loader selects the first building with floors when possible, falling back cleanly when no floors exist.
