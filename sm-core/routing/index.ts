/**
 * sm-core/routing — indoor and multi-floor routing.
 *
 * A* over travel *time* rather than distance, with vertical connectors (stairs,
 * lifts, escalators) as real graph edges carrying their own per-floor cost. The
 * heuristic stays admissible across floors, so a step-free route is found by
 * excluding stair edges rather than by post-filtering a route that used them.
 */

export { RoutingEngine, type IndoorRoute, type RouteStep, type RouteRequest } from './RoutingEngine';
export { GraphBuilder } from './GraphBuilder';
