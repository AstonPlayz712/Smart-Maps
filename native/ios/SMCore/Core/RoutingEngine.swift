// RoutingEngine.swift — A/E Routing: A* + ETA + turn-by-turn.
//
// A* with a haversine heuristic over edge travel times, then instruction
// generation from bearing deltas at each node. Mirrors the Kotlin engine.

import Foundation

final class RoutingEngine {

    init() {}

    func route(graph: RoadGraph, from: GeoPoint, to: GeoPoint) -> Route? {
        guard !graph.edges.isEmpty,
              let startNode = nearestNode(graph, from),
              let goalNode = nearestNode(graph, to) else { return nil }
        if startNode.id == goalNode.id {
            return Route(
                points: [from, to],
                steps: [RouteStep(turn: .arrive, instruction: "Arrive at destination", point: to, distanceM: 0, etaS: 0)],
                distanceM: haversineM(from, to),
                etaS: 0
            )
        }

        // ── A* over travel-time cost ───────────────────────────────────────
        var gScore: [String: Double] = [startNode.id: 0]
        var cameFrom: [String: (prev: String, via: RoadEdge)] = [:]
        var open: [(nodeId: String, f: Double)] = [(startNode.id, heuristicS(startNode.point, goalNode.point))]
        var closed = Set<String>()

        while !open.isEmpty {
            open.sort { $0.f < $1.f }
            let current = open.removeFirst()
            if current.nodeId == goalNode.id { break }
            if closed.contains(current.nodeId) { continue }
            closed.insert(current.nodeId)

            guard let currentPoint = graph.nodes[current.nodeId]?.point else { continue }
            for edge in graph.edgesFrom(current.nodeId) {
                let neighborId = edge.fromNodeId == current.nodeId ? edge.toNodeId : edge.fromNodeId
                if closed.contains(neighborId) { continue }
                let travelS = edge.lengthM / max(edge.speedLimitMps, 1)
                let tentative = (gScore[current.nodeId] ?? .greatestFiniteMagnitude) + travelS
                if tentative < (gScore[neighborId] ?? .greatestFiniteMagnitude) {
                    gScore[neighborId] = tentative
                    cameFrom[neighborId] = (current.nodeId, edge)
                    let neighborPoint = graph.nodes[neighborId]?.point ?? currentPoint
                    open.append((neighborId, tentative + heuristicS(neighborPoint, goalNode.point)))
                }
            }
        }
        guard gScore[goalNode.id] != nil else { return nil }

        // ── reconstruct chain ──────────────────────────────────────────────
        var edgeChain: [RoadEdge] = []
        var nodeChain: [String] = [goalNode.id]
        var cursor = goalNode.id
        while cursor != startNode.id {
            guard let step = cameFrom[cursor] else { return nil }
            edgeChain.insert(step.via, at: 0)
            nodeChain.insert(step.prev, at: 0)
            cursor = step.prev
        }

        // ── geometry ───────────────────────────────────────────────────────
        var points: [GeoPoint] = [from]
        for (i, edge) in edgeChain.enumerated() {
            let forward = edge.fromNodeId == nodeChain[i]
            points.append(contentsOf: forward ? edge.path : edge.path.reversed())
        }
        points.append(to)

        // ── turn-by-turn ───────────────────────────────────────────────────
        var steps: [RouteStep] = []
        var cumDistM = haversineM(from, startNode.point)
        var cumEtaS = 0.0
        steps.append(RouteStep(
            turn: .depart,
            instruction: "Head \(cardinal(firstBearing(points)))",
            point: from, distanceM: 0, etaS: 0
        ))
        if edgeChain.count > 1 {
            for i in 1..<edgeChain.count {
                let prevEdge = edgeChain[i - 1]
                let nextEdge = edgeChain[i]
                guard let nodePoint = graph.nodes[nodeChain[i]]?.point else { continue }
                cumDistM += prevEdge.lengthM
                cumEtaS += prevEdge.lengthM / max(prevEdge.speedLimitMps, 1)
                let inB = incomingBearing(prevEdge, atNodeId: nodeChain[i])
                let outB = outgoingBearing(nextEdge, atNodeId: nodeChain[i])
                let turn = classifyTurn(shortestAngleDeltaDeg(from: inB, to: outB))
                if turn != .continue {
                    let road = nextEdge.name ?? "the road"
                    steps.append(RouteStep(
                        turn: turn,
                        instruction: "\(turnPhrase(turn)) onto \(road)",
                        point: nodePoint, distanceM: cumDistM, etaS: cumEtaS
                    ))
                }
            }
        }
        if let last = edgeChain.last {
            cumDistM += last.lengthM
            cumEtaS += last.lengthM / max(last.speedLimitMps, 1)
        }
        cumDistM += haversineM(goalNode.point, to)
        steps.append(RouteStep(turn: .arrive, instruction: "Arrive at destination", point: to, distanceM: cumDistM, etaS: cumEtaS))

        return Route(points: points, steps: steps, distanceM: cumDistM, etaS: cumEtaS)
    }

    /// Live remaining distance/ETA from a position on the route.
    func remaining(route: Route, at: GeoPoint) -> (distM: Double, etaS: Double) {
        var nearestIdx = 0
        var nearestD = Double.greatestFiniteMagnitude
        for (i, p) in route.points.enumerated() {
            let d = haversineM(at, p)
            if d < nearestD { nearestD = d; nearestIdx = i }
        }
        var dist = 0.0
        if nearestIdx < route.points.count - 1 {
            for i in nearestIdx..<(route.points.count - 1) {
                dist += haversineM(route.points[i], route.points[i + 1])
            }
        }
        let fraction = route.distanceM > 0 ? dist / route.distanceM : 0
        return (dist, route.etaS * fraction)
    }

    /// The next upcoming step from a position.
    func nextStep(route: Route, at: GeoPoint) -> RouteStep? {
        let travelledM = route.distanceM - remaining(route: route, at: at).distM
        return route.steps.first { $0.distanceM > travelledM + 5 } ?? route.steps.last
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private func heuristicS(_ a: GeoPoint, _ b: GeoPoint) -> Double { haversineM(a, b) / 33.0 }

    private func nearestNode(_ graph: RoadGraph, _ p: GeoPoint) -> RoadNode? {
        graph.nodes.values.min { haversineM($0.point, p) < haversineM($1.point, p) }
    }

    private func incomingBearing(_ edge: RoadEdge, atNodeId: String) -> Double {
        let path = edge.toNodeId == atNodeId ? edge.path : edge.path.reversed()
        return bearingDeg(path[path.count - 2], path[path.count - 1])
    }

    private func outgoingBearing(_ edge: RoadEdge, atNodeId: String) -> Double {
        let path = edge.fromNodeId == atNodeId ? edge.path : edge.path.reversed()
        return bearingDeg(path[0], path[1])
    }

    private func classifyTurn(_ delta: Double) -> Turn {
        switch delta {
        case let d where abs(d) < 20: return .continue
        case 20...45: return .slightRight
        case 45...120: return .right
        case 120...170: return .sharpRight
        case -45...(-20): return .slightLeft
        case -120...(-45): return .left
        case -170...(-120): return .sharpLeft
        default: return .uTurn
        }
    }

    private func turnPhrase(_ turn: Turn) -> String {
        switch turn {
        case .slightLeft: return "Bear left"
        case .left: return "Turn left"
        case .sharpLeft: return "Turn sharp left"
        case .slightRight: return "Bear right"
        case .right: return "Turn right"
        case .sharpRight: return "Turn sharp right"
        case .uTurn: return "Make a U-turn"
        default: return "Continue"
        }
    }

    private func firstBearing(_ points: [GeoPoint]) -> Double {
        points.count >= 2 ? bearingDeg(points[0], points[1]) : 0
    }

    private func cardinal(_ bearing: Double) -> String {
        let dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
        return dirs[Int(((bearing + 22.5).truncatingRemainder(dividingBy: 360)) / 45)]
    }
}
