/**
 * RoutingEngine — indoor routing, including between floors.
 *
 * A* over the 3D graph from GraphBuilder. Because vertical connectors are
 * ordinary edges with a time cost, a multi-floor route falls out of the same
 * search as a flat one — the router naturally prefers a lift over three
 * flights of stairs when the lift is quicker, and honours one-way escalators
 * because those edges only exist in one direction.
 *
 * Identical on iOS, Android and Web: pure data in, pure data out.
 */

import type { IndoorConnector, IndoorVenue, LngLat } from '../map/types';
import {
  GraphBuilder,
  haversineM,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type RouteGraph
} from './GraphBuilder';

export interface RouteStep {
  kind: EdgeKind;
  from: LngLat;
  to: LngLat;
  fromFloor: number;
  toFloor: number;
  distanceM: number;
  seconds: number;
  connector?: IndoorConnector;
  instruction: string;
}

export interface IndoorRoute {
  venueId: string;
  steps: RouteStep[];
  totalSeconds: number;
  totalDistanceM: number;
  /** Every floor the route passes through, in order of first visit. */
  floorSequence: number[];
  /** True when the route changes floor at least once. */
  multiFloor: boolean;
}

export interface RouteRequest {
  from: LngLat;
  fromFloor: number;
  to: LngLat;
  toFloor: number;
  /** Exclude connector kinds — e.g. step-free routing drops stairs. */
  avoid?: EdgeKind[];
}

/** Assumed walking pace, used for the A* heuristic. */
const WALK_SPEED_MPS = 1.35;
/** Optimistic seconds per floor for the heuristic — must not overestimate. */
const OPTIMISTIC_SECONDS_PER_FLOOR = 10;

export class RoutingEngine {
  private graph: RouteGraph | null = null;
  private venue: IndoorVenue | null = null;

  /** Load a venue and build its routable graph. */
  loadVenue(venue: IndoorVenue): void {
    this.venue = venue;
    this.graph = GraphBuilder.fromVenue(venue);
  }

  isLoaded(): boolean {
    return this.graph !== null;
  }

  graphStats() {
    if (!this.graph) return { nodes: 0, edges: 0 };
    let edges = 0;
    for (const list of this.graph.edges.values()) edges += list.length;
    return { nodes: this.graph.nodes.size, edges };
  }

  /** Compute a route. Returns null when no path exists. */
  route(request: RouteRequest): IndoorRoute | null {
    const graph = this.graph;
    if (!graph) return null;

    const start = GraphBuilder.nearestNode(graph, request.from, request.fromFloor);
    const goal = GraphBuilder.nearestNode(graph, request.to, request.toFloor);
    if (!start || !goal) return null;

    const avoid = new Set(request.avoid ?? []);
    const path = this.search(graph, start, goal, avoid);
    if (!path) return null;

    return this.toRoute(graph, path, request);
  }

  /**
   * Does this route require a floor change from where the user is now?
   * The renderer uses this to swap the indoor layer as the user progresses.
   */
  static nextFloorChange(route: IndoorRoute, currentFloor: number): RouteStep | null {
    return (
      route.steps.find((step) => step.fromFloor === currentFloor && step.toFloor !== currentFloor) ??
      null
    );
  }

  // ─── A* ───────────────────────────────────────────────────────────────────

  private search(
    graph: RouteGraph,
    start: GraphNode,
    goal: GraphNode,
    avoid: Set<EdgeKind>
  ): GraphEdge[] | null {
    const gScore = new Map<string, number>([[start.id, 0]]);
    const cameFrom = new Map<string, { prev: string; edge: GraphEdge }>();
    const open: { id: string; f: number }[] = [
      { id: start.id, f: this.heuristic(start, goal) }
    ];
    const closed = new Set<string>();

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;
      if (current.id === goal.id) break;
      if (closed.has(current.id)) continue;
      closed.add(current.id);

      for (const edge of graph.edges.get(current.id) ?? []) {
        if (avoid.has(edge.kind)) continue;
        if (closed.has(edge.to)) continue;

        const tentative = (gScore.get(current.id) ?? Infinity) + edge.costSeconds;
        if (tentative >= (gScore.get(edge.to) ?? Infinity)) continue;

        gScore.set(edge.to, tentative);
        cameFrom.set(edge.to, { prev: current.id, edge });
        const next = graph.nodes.get(edge.to);
        if (next) open.push({ id: edge.to, f: tentative + this.heuristic(next, goal) });
      }
    }

    if (!gScore.has(goal.id)) return null;

    const edges: GraphEdge[] = [];
    let cursor = goal.id;
    while (cursor !== start.id) {
      const step = cameFrom.get(cursor);
      if (!step) return null;
      edges.unshift(step.edge);
      cursor = step.prev;
    }
    return edges;
  }

  /** Admissible: never overestimates the true remaining cost. */
  private heuristic(node: GraphNode, goal: GraphNode): number {
    const horizontal = haversineM(node.position, goal.position) / WALK_SPEED_MPS;
    const vertical =
      Math.abs(node.floorLevel - goal.floorLevel) * OPTIMISTIC_SECONDS_PER_FLOOR;
    return horizontal + vertical;
  }

  // ─── shaping ──────────────────────────────────────────────────────────────

  private toRoute(graph: RouteGraph, edges: GraphEdge[], request: RouteRequest): IndoorRoute {
    const steps: RouteStep[] = [];
    let totalSeconds = 0;
    let totalDistanceM = 0;
    const floorSequence: number[] = [request.fromFloor];

    for (const edge of edges) {
      const from = graph.nodes.get(edge.from);
      const to = graph.nodes.get(edge.to);
      if (!from || !to) continue;

      const distanceM = edge.floorDelta === 0 ? haversineM(from.position, to.position) : 0;
      totalSeconds += edge.costSeconds;
      totalDistanceM += distanceM;

      if (floorSequence[floorSequence.length - 1] !== to.floorLevel) {
        floorSequence.push(to.floorLevel);
      }

      steps.push({
        kind: edge.kind,
        from: from.position,
        to: to.position,
        fromFloor: from.floorLevel,
        toFloor: to.floorLevel,
        distanceM,
        seconds: edge.costSeconds,
        connector: edge.connector,
        instruction: instructionFor(edge, from, to)
      });
    }

    // Collapse consecutive walk steps on one floor — a route reads better as
    // "walk 40 m, take the lift to 2" than as eleven micro-hops.
    const merged = mergeWalks(steps);

    return {
      venueId: graph.venueId,
      steps: merged,
      totalSeconds: round(totalSeconds, 1),
      totalDistanceM: round(totalDistanceM, 1),
      floorSequence,
      multiFloor: floorSequence.length > 1
    };
  }
}

function instructionFor(edge: GraphEdge, from: GraphNode, to: GraphNode): string {
  if (edge.kind === 'walk') {
    const metres = Math.round(haversineM(from.position, to.position));
    return metres > 0 ? `Walk ${metres} m` : 'Continue';
  }
  return instructionForKind(edge.kind, to.floorLevel);
}

function instructionForKind(kind: EdgeKind, toFloor: number): string {
  switch (kind) {
    case 'stairs': return `Take the stairs to level ${toFloor}`;
    case 'lift': return `Take the lift to level ${toFloor}`;
    case 'escalator': return `Take the escalator to level ${toFloor}`;
    default: return 'Continue';
  }
}

function mergeWalks(steps: RouteStep[]): RouteStep[] {
  const merged: RouteStep[] = [];
  for (const step of steps) {
    const last = merged[merged.length - 1];

    // Consecutive hops through the *same* connector are one manoeuvre: riding
    // a lift from 0 to 2 is one instruction, not one per floor.
    if (
      last &&
      last.kind !== 'walk' &&
      step.kind === last.kind &&
      last.connector?.id === step.connector?.id &&
      last.toFloor === step.fromFloor
    ) {
      last.to = step.to;
      last.toFloor = step.toFloor;
      last.seconds = round(last.seconds + step.seconds, 1);
      last.instruction = instructionForKind(step.kind, step.toFloor);
      continue;
    }

    if (last && last.kind === 'walk' && step.kind === 'walk' && last.toFloor === step.fromFloor) {
      last.to = step.to;
      last.distanceM = round(last.distanceM + step.distanceM, 1);
      last.seconds = round(last.seconds + step.seconds, 1);
      last.instruction = `Walk ${Math.round(last.distanceM)} m`;
      continue;
    }
    merged.push({ ...step, distanceM: round(step.distanceM, 1), seconds: round(step.seconds, 1) });
  }
  return merged;
}

const round = (v: number, dp: number) => Number(v.toFixed(dp));
