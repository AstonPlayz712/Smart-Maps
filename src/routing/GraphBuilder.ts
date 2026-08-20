/**
 * GraphBuilder — turns indoor venue data into a routable 3D graph.
 *
 * The key idea: a node is identified by (floor, place), not place alone, and
 * connectors become *vertical edges* joining the same place across floors.
 * That makes a multi-floor route just a shortest path over one graph — no
 * special-casing per floor, and identical behaviour on every platform.
 */

import type { IndoorConnector, IndoorVenue, LngLat, VerticalConnectorKind } from '../map/types';

export type EdgeKind = 'walk' | VerticalConnectorKind;

export interface GraphNode {
  id: string;
  position: LngLat;
  floorLevel: number;
  /** Set for nodes that sit on a vertical connector. */
  connectorId?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Traversal cost in seconds — the currency the router minimises. */
  costSeconds: number;
  /** Floors this edge moves between (0 for a walk). */
  floorDelta: number;
  connector?: IndoorConnector;
}

export interface RouteGraph {
  nodes: Map<string, GraphNode>;
  /** Adjacency: node id → outgoing edges. */
  edges: Map<string, GraphEdge[]>;
  venueId: string;
}

/** Assumed walking pace on the flat, m/s. */
const WALK_SPEED_MPS = 1.35;

export class GraphBuilder {
  /** Build the routable graph for a venue. */
  static fromVenue(venue: IndoorVenue): RouteGraph {
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge[]>();

    const addEdge = (edge: GraphEdge) => {
      const list = edges.get(edge.from);
      if (list) list.push(edge);
      else edges.set(edge.from, [edge]);
    };

    // ── horizontal: each floor's walk graph ───────────────────────────────
    for (const floor of venue.floors) {
      for (const node of floor.walkNodes ?? []) {
        nodes.set(node.id, {
          id: node.id,
          position: node.position,
          floorLevel: floor.level
        });
      }
      for (const edge of floor.walkEdges ?? []) {
        const a = nodes.get(edge.from);
        const b = nodes.get(edge.to);
        if (!a || !b) continue;
        const seconds = haversineM(a.position, b.position) / WALK_SPEED_MPS;
        // Walk edges are bidirectional.
        addEdge({ from: a.id, to: b.id, kind: 'walk', costSeconds: seconds, floorDelta: 0 });
        addEdge({ from: b.id, to: a.id, kind: 'walk', costSeconds: seconds, floorDelta: 0 });
      }
    }

    // ── vertical: connectors become edges between floors ──────────────────
    for (const connector of venue.connectors) {
      const servedFloors = [...connector.floors].sort((a, b) => a - b);

      // A landing node per served floor, so the router can walk to the
      // connector on one floor and leave it on another.
      for (const level of servedFloors) {
        const id = connectorNodeId(connector.id, level);
        nodes.set(id, {
          id,
          position: connector.position,
          floorLevel: level,
          connectorId: connector.id
        });

        // Join the landing to that floor's nearest walk node.
        const nearest = nearestOnFloor(nodes, level, connector.position, connector.id);
        if (nearest) {
          const seconds = haversineM(connector.position, nearest.position) / WALK_SPEED_MPS;
          addEdge({ from: id, to: nearest.id, kind: 'walk', costSeconds: seconds, floorDelta: 0 });
          addEdge({ from: nearest.id, to: id, kind: 'walk', costSeconds: seconds, floorDelta: 0 });
        }
      }

      // Vertical edges between consecutive served floors.
      for (let i = 0; i < servedFloors.length - 1; i++) {
        const lower = servedFloors[i];
        const upper = servedFloors[i + 1];
        const delta = upper - lower;
        const seconds = connector.secondsPerFloor * delta;

        addEdge({
          from: connectorNodeId(connector.id, lower),
          to: connectorNodeId(connector.id, upper),
          kind: connector.kind,
          costSeconds: seconds,
          floorDelta: delta,
          connector
        });

        // Escalators are commonly one-way; honour that.
        if (connector.bidirectional !== false) {
          addEdge({
            from: connectorNodeId(connector.id, upper),
            to: connectorNodeId(connector.id, lower),
            kind: connector.kind,
            costSeconds: seconds,
            floorDelta: -delta,
            connector
          });
        }
      }
    }

    return { nodes, edges, venueId: venue.venueId };
  }

  /** Nearest graph node to a position on a given floor. */
  static nearestNode(
    graph: RouteGraph,
    position: LngLat,
    floorLevel: number
  ): GraphNode | null {
    let best: GraphNode | null = null;
    let bestDistance = Infinity;
    for (const node of graph.nodes.values()) {
      if (node.floorLevel !== floorLevel) continue;
      const d = haversineM(node.position, position);
      if (d < bestDistance) {
        bestDistance = d;
        best = node;
      }
    }
    return best;
  }
}

export function connectorNodeId(connectorId: string, level: number): string {
  return `${connectorId}@${level}`;
}

export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestOnFloor(
  nodes: Map<string, GraphNode>,
  level: number,
  position: LngLat,
  excludeConnectorId: string
): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDistance = Infinity;
  for (const node of nodes.values()) {
    if (node.floorLevel !== level) continue;
    if (node.connectorId === excludeConnectorId) continue;
    const d = haversineM(node.position, position);
    if (d < bestDistance) {
      bestDistance = d;
      best = node;
    }
  }
  return best;
}

const toRad = (d: number) => (d * Math.PI) / 180;
