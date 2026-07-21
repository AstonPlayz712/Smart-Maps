package com.smartmaps.ae.core

import java.util.PriorityQueue
import kotlin.math.abs

/**
 * A/E Routing Engine — A* over the road graph + ETA + turn-by-turn.
 *
 * A* with a haversine heuristic over edge travel times (length / speed
 * limit), then instruction generation from bearing deltas at each node.
 * Everything is computed from graph geometry at request time — no
 * precomputed manoeuvre tables.
 */
class RoutingEngine {

    /** Route from [from] to [to] snapped onto [graph]. Null when unreachable. */
    fun route(graph: RoadGraph, from: GeoPoint, to: GeoPoint): Route? {
        if (graph.edges.isEmpty()) return null
        val startNode = nearestNode(graph, from) ?: return null
        val goalNode = nearestNode(graph, to) ?: return null
        if (startNode.id == goalNode.id) {
            return Route(listOf(from, to), arriveOnly(to), haversineM(from, to), 0.0)
        }

        // ── A* over travel-time cost ───────────────────────────────────────
        data class Entry(val nodeId: String, val f: Double)

        val gScore = mutableMapOf(startNode.id to 0.0)
        val cameFrom = mutableMapOf<String, Pair<String, RoadEdge>>() // node -> (prevNode, viaEdge)
        val open = PriorityQueue<Entry>(compareBy { it.f })
        open.add(Entry(startNode.id, heuristicS(startNode.point, goalNode.point)))
        val closed = mutableSetOf<String>()

        while (open.isNotEmpty()) {
            val current = open.poll()!!
            if (current.nodeId == goalNode.id) break
            if (!closed.add(current.nodeId)) continue

            val currentPoint = graph.nodes[current.nodeId]?.point ?: continue
            for (edge in graph.edgesFrom(current.nodeId)) {
                val neighborId = if (edge.fromNodeId == current.nodeId) edge.toNodeId else edge.fromNodeId
                if (neighborId in closed) continue
                val travelS = edge.lengthM / edge.speedLimitMps.coerceAtLeast(1.0)
                val tentative = (gScore[current.nodeId] ?: Double.MAX_VALUE) + travelS
                if (tentative < (gScore[neighborId] ?: Double.MAX_VALUE)) {
                    gScore[neighborId] = tentative
                    cameFrom[neighborId] = current.nodeId to edge
                    val neighborPoint = graph.nodes[neighborId]?.point ?: currentPoint
                    open.add(Entry(neighborId, tentative + heuristicS(neighborPoint, goalNode.point)))
                }
            }
        }
        if (goalNode.id !in gScore) return null

        // ── reconstruct node/edge chain ────────────────────────────────────
        val edgeChain = mutableListOf<RoadEdge>()
        val nodeChain = mutableListOf(goalNode.id)
        var cursor = goalNode.id
        while (cursor != startNode.id) {
            val (prev, via) = cameFrom[cursor] ?: return null
            edgeChain.add(0, via)
            nodeChain.add(0, prev)
            cursor = prev
        }

        // ── geometry: concatenate edge polylines in travel direction ───────
        val points = mutableListOf(from)
        for ((i, edge) in edgeChain.withIndex()) {
            val forward = edge.fromNodeId == nodeChain[i]
            val path = if (forward) edge.path else edge.path.reversed()
            points.addAll(path)
        }
        points.add(to)

        // ── turn-by-turn from bearing deltas at nodes ──────────────────────
        val steps = mutableListOf<RouteStep>()
        var cumDistM = haversineM(from, graph.nodes[startNode.id]!!.point)
        var cumEtaS = 0.0
        steps.add(RouteStep(Turn.DEPART, "Head ${cardinal(firstBearing(points))}", from, 0.0, 0.0))
        for (i in 1 until edgeChain.size) {
            val prevEdge = edgeChain[i - 1]
            val nextEdge = edgeChain[i]
            val nodePoint = graph.nodes[nodeChain[i]]?.point ?: continue
            cumDistM += prevEdge.lengthM
            cumEtaS += prevEdge.lengthM / prevEdge.speedLimitMps.coerceAtLeast(1.0)
            val inBearing = incomingBearing(prevEdge, nodeChain[i])
            val outBearing = outgoingBearing(nextEdge, nodeChain[i])
            val turn = classifyTurn(shortestAngleDeltaDeg(inBearing, outBearing))
            if (turn != Turn.CONTINUE) {
                val road = nextEdge.name ?: "the road"
                steps.add(RouteStep(turn, "${turnPhrase(turn)} onto $road", nodePoint, cumDistM, cumEtaS))
            }
        }
        val last = edgeChain.lastOrNull()
        if (last != null) {
            cumDistM += last.lengthM
            cumEtaS += last.lengthM / last.speedLimitMps.coerceAtLeast(1.0)
        }
        cumDistM += haversineM(graph.nodes[goalNode.id]!!.point, to)
        steps.add(RouteStep(Turn.ARRIVE, "Arrive at destination", to, cumDistM, cumEtaS))

        return Route(points, steps, cumDistM, cumEtaS)
    }

    /** Live remaining distance/ETA from a position on the route. */
    fun remaining(route: Route, at: GeoPoint): Pair<Double, Double> {
        var nearestIdx = 0
        var nearestD = Double.MAX_VALUE
        for (i in route.points.indices) {
            val d = haversineM(at, route.points[i])
            if (d < nearestD) {
                nearestD = d
                nearestIdx = i
            }
        }
        var dist = 0.0
        for (i in nearestIdx until route.points.size - 1) {
            dist += haversineM(route.points[i], route.points[i + 1])
        }
        val fraction = if (route.distanceM > 0) dist / route.distanceM else 0.0
        return dist to route.etaS * fraction
    }

    /** The next upcoming step from a position. */
    fun nextStep(route: Route, at: GeoPoint): RouteStep? {
        val (remainingM, _) = remaining(route, at)
        val travelledM = route.distanceM - remainingM
        return route.steps.firstOrNull { it.distanceM > travelledM + 5 } ?: route.steps.lastOrNull()
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private fun heuristicS(a: GeoPoint, b: GeoPoint): Double = haversineM(a, b) / 33.0 // ~120 km/h ceiling keeps it admissible

    private fun nearestNode(graph: RoadGraph, p: GeoPoint): RoadNode? =
        graph.nodes.values.minByOrNull { haversineM(it.point, p) }

    private fun incomingBearing(edge: RoadEdge, atNodeId: String): Double {
        val path = if (edge.toNodeId == atNodeId) edge.path else edge.path.reversed()
        val n = path.size
        return bearingDeg(path[n - 2], path[n - 1])
    }

    private fun outgoingBearing(edge: RoadEdge, atNodeId: String): Double {
        val path = if (edge.fromNodeId == atNodeId) edge.path else edge.path.reversed()
        return bearingDeg(path[0], path[1])
    }

    private fun classifyTurn(delta: Double): Turn = when {
        abs(delta) < 20 -> Turn.CONTINUE
        delta in 20.0..45.0 -> Turn.SLIGHT_RIGHT
        delta in 45.0..120.0 -> Turn.RIGHT
        delta in 120.0..170.0 -> Turn.SHARP_RIGHT
        delta in -45.0..-20.0 -> Turn.SLIGHT_LEFT
        delta in -120.0..-45.0 -> Turn.LEFT
        delta in -170.0..-120.0 -> Turn.SHARP_LEFT
        else -> Turn.U_TURN
    }

    private fun turnPhrase(turn: Turn): String = when (turn) {
        Turn.SLIGHT_LEFT -> "Bear left"
        Turn.LEFT -> "Turn left"
        Turn.SHARP_LEFT -> "Turn sharp left"
        Turn.SLIGHT_RIGHT -> "Bear right"
        Turn.RIGHT -> "Turn right"
        Turn.SHARP_RIGHT -> "Turn sharp right"
        Turn.U_TURN -> "Make a U-turn"
        else -> "Continue"
    }

    private fun firstBearing(points: List<GeoPoint>): Double =
        if (points.size >= 2) bearingDeg(points[0], points[1]) else 0.0

    private fun cardinal(bearing: Double): String {
        val dirs = listOf("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
        return dirs[(((bearing + 22.5) % 360) / 45).toInt()]
    }

    private fun arriveOnly(to: GeoPoint) =
        listOf(RouteStep(Turn.ARRIVE, "Arrive at destination", to, 0.0, 0.0))
}
