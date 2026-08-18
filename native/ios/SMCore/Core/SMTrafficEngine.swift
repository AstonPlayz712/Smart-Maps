//  SMTrafficEngine.swift
//  6D traffic. MapKit renders Apple's traffic tiles but exposes no traffic
//  *data* to apps, so SM derives congestion from its own measurements: the
//  ratio of observed speed to the road's free-flow limit, smoothed per edge,
//  plus ETA drift. Real signal, no invented feed.

import Foundation

struct SMTrafficState {
    /// 0 (free flowing) … 1 (stationary jam).
    let level: Double
    /// Observed speed as a fraction of the free-flow limit.
    let flowRatio: Double
    /// Congestion samples SM has accumulated for the current edge.
    let sampleCount: Int
}

final class SMTrafficEngine {

    private struct EdgeFlow {
        var ratioEMA: Double
        var samples: Int
    }

    private var flows: [String: EdgeFlow] = [:]
    private var currentLevel = 0.0

    func update(
        snap: SnapResult?,
        graph: RoadGraph,
        speedMps: Double,
        motionState: SMMotionState,
        dt: TimeInterval
    ) -> SMTrafficState {
        guard let snap, snap.onRoad,
              let edge = graph.edges.first(where: { $0.id == snap.edgeId }),
              motionState == .driving else {
            // Only driving samples say anything about traffic.
            return SMTrafficState(level: currentLevel, flowRatio: 1, sampleCount: 0)
        }

        let freeFlow = max(edge.speedLimitMps, 1)
        let ratio = max(0, min(1.2, speedMps / freeFlow))

        var flow = flows[edge.id] ?? EdgeFlow(ratioEMA: ratio, samples: 0)
        flow.ratioEMA += (ratio - flow.ratioEMA) * 0.1
        flow.samples += 1
        flows[edge.id] = flow

        // Congestion is the inverse of flow, but only once enough of the edge
        // has actually been observed — one slow moment is not a jam.
        let confidence = min(1, Double(flow.samples) / 20)
        let target = (1 - min(1, flow.ratioEMA)) * confidence
        currentLevel += (target - currentLevel) * (1 - exp(-dt / 4.0))

        return SMTrafficState(
            level: min(1, max(0, currentLevel)),
            flowRatio: flow.ratioEMA,
            sampleCount: flow.samples
        )
    }

    func reset() {
        flows.removeAll()
        currentLevel = 0
    }
}
