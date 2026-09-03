# MapForge User Guide

MapForge is an interactive indoor and campus map editor. It lets an admin create an organization map, trace buildings from blueprints, add floors and navigable nodes, connect those nodes, publish the map, and let viewers search or find routes without editing the underlying data.

## Accessing The Application

Open the live application here:

[https://mapforge-chi.vercel.app/](https://mapforge-chi.vercel.app/)

Log in with the admin account:

- Email: `admin@gmail.com`
- Password: `password`

## Main Pages

**Login Page**

Use this page to sign in. Admin users can create and edit maps. Public users can browse published maps and inspect routes.

**Browse Page**

This is where organizations are listed. An organization represents one map project, such as a campus, mall, hospital, office complex, or public venue. From here, an admin can create a new organization, edit an existing one, open its editor, publish it, view it, or remove it.

**Admin Editor Page**

This is the main map-building workspace. It works like a canvas editor: you can pan, zoom, trace buildings, upload blueprints, add floors, create nodes, connect paths, inspect properties, undo and redo changes, and publish the map.

**Viewer Page**

This page is for inspecting a published map. It supports searching, selecting buildings and nodes, panning, zooming, and finding routes, but it does not allow editing.

## Recommended Admin Flow

1. Log in using the admin account.

2. Go to the admin browse page.

3. Create a new organization or open an existing one.

4. When creating a new organization, define the canvas dimensions. The canvas is the full working area of the map.

5. Open the editor page for the organization.

6. If this is a new map, import a blueprint using the blueprint upload tool. The upload button uses an image icon in the toolbar.

7. Use the selection tool to resize, move, rotate, adjust opacity, lock, hide, or delete the blueprint.

8. Use the pan tool to move around the canvas without editing elements.

9. Use the draw building boundary tool to trace the buildings from the blueprint. The tool behaves like a pen tool: click points around the building outline and close the shape when the boundary is complete.

10. Create floors inside each building. Floors can be selected from the floor controls. Nodes from floors that are not currently active still appear on the map, but they are dimmed so the active floor stays clear.

11. Create nodes inside buildings and floors. Nodes represent rooms, entrances, corridor points, stairs, elevators, restrooms, offices, cafeterias, landmarks, gates, exits, paths, intersections, courtyards, and other important navigation points.

12. Use the properties sidebar on the right to inspect or change the selected node, including its building and floor.

13. Connect nodes using the connect nodes tool:

- Click a node to make it the source of the connection.
- Click another node to create a connection and make that second node the new source.
- Click a third node to continue the chain and connect the second node to the third.
- Double-click a node if you want to switch the connection source manually.
- Continue the same process to build a connected route graph.
- Connections on the same floor are shown as solid lines.
- Connections between different floors are shown as dashed lines.

14. Check routing with the route tool. Click the first node as the source, then click the second node as the destination. The resulting route appears in gold.

15. The route tool can show routes between nodes on the same floor or nodes on different floors. When a route crosses floors, same-floor parts are shown as solid gold lines and cross-floor parts are shown as dashed gold lines.

16. To clear a displayed route, switch back to the pan tool or the selection tool.

17. Use the search bar to find nodes or buildings quickly.

18. Save the map with the dedicated Save button when you want an explicit save confirmation.

19. Publish individual buildings with the dedicated Publish building button when they are ready.

20. Publish the full map when the map is ready for viewers.

21. If something goes wrong while editing, use the undo and redo buttons in the toolbar.

22. Click View to open the viewer page and inspect the published map as a non-editing user would see it.

## Publishing Rules

Before a building can be published, it must be ready for navigation:

- The building must have at least one floor.
- The building must have at least one entrance or gate node.
- The default campus building is created automatically with the organization, but it must still follow the same rule: it needs a floor and a gate before it can be published.

## Viewer Flow

The viewer page is used for inspection only. You can:

- Search for a building or node.
- Select buildings and nodes to inspect their details.
- Pan and zoom around the map.
- Use the route tool to click two nodes and display the route between them.
- Use the route search fields to find a route by searching for the origin and destination.
- View the route path and total distance at the bottom of the canvas.

The viewer page does not create, update, delete, or publish map data.

## WebMCP / AI Agent Usage

MapForge includes WebMCP integration so capable AI agents can interact with the currently open map.

To test it:

1. Open MapForge in a WebMCP-capable browser, such as Chrome.
2. Use a dedicated WebMCP extension, for example **WebMCP - Model Context Tool Inspector**.
3. Open an organization map in MapForge.
4. Inspect the available WebMCP tools.

Examples of useful AI-agent requests:

- Create a node near another node.
- Create a node at the top of a building.
- Link two nodes together.
- Find a route from a gate to a building entrance.
- Find the route between two buildings.
- List the biggest buildings.
- Explain which buildings are north, south, east, or west of another building.
- Give an overview of the current map.
- Delete a building or floor after confirmation.

Editing operations are restricted to admin users. Destructive operations such as deleting buildings or publishing maps require confirmation in the application.

## Map Data Model

MapForge organizes map data in a simple hierarchy:

- Organization
  - Building
    - Floor
      - Node
      - Connection
  - Blueprint / reference image

**Organization**

An organization is the main map project. It has a canvas with a width and height, and it contains the buildings, floors, nodes, connections, and optional blueprint images.

**Building**

A building is a traced area on the canvas. It can contain one or more floors. A special default campus building may exist conceptually to connect outdoor or shared navigation points, but it is not treated like a physical building outline.

**Floor**

A floor belongs to a building. Each floor can contain its own nodes and connections. Nodes from other floors can still be visible, but they appear dimmed when they are not part of the active floor.

**Node**

A node is a navigable point. It can represent a room, entrance, corridor point, stair, elevator, restroom, cafeteria, office, path point, intersection, gate, courtyard, landmark, or exit.

**Connection**

A connection links two nodes and makes routing possible. Connections can be on the same floor or across different floors. Same-floor connections are displayed with solid lines, while cross-floor connections are displayed with dashed lines.

**Blueprint / Reference Image**

A blueprint is an image placed on the canvas to help trace the map. It can be moved, resized, rotated, hidden, locked, deleted, and adjusted for opacity.

## Practical Tips

- Start with the blueprint before tracing buildings.
- Create building boundaries before adding detailed floor nodes.
- Add entrances and gates early, because they make building-to-building routing easier.
- Use corridor points and intersections to make routes more accurate.
- Keep node names readable and meaningful when possible.
- Use cross-floor connections for stairs and elevators.
- Check routes before publishing so viewers get reliable paths.
- Publish only after the map is connected enough for navigation.
