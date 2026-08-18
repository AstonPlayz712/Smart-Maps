// TransportTimeEngine.swift — A/E Transport Time: bus/train/tube feeds.
//
// Providers register and are polled by AECore's tick; the board is exactly
// the union of what providers know. Absence of live data is absence — never
// faked, no fallback ladders. Mirrors the Kotlin engine.

import Foundation

protocol TransportFeedProvider {
    var id: String { get }
    var modes: Set<TransportMode> { get }
    func stopsNear(center: GeoPoint, radiusM: Double) -> [TransitStop]
    func arrivals(stopId: String, nowMs: Int64) -> [TransitArrival]
}

final class TransportTimeEngine {

    private var providers: [TransportFeedProvider] = []
    private var board: [String: [TransitArrival]] = [:]
    private var nearbyStops: [TransitStop] = []
    private var lastRefreshMs: Int64 = 0
    private let refreshIntervalMs: Int64 = 15_000

    init() {}

    func register(_ provider: TransportFeedProvider) {
        if !providers.contains(where: { $0.id == provider.id }) {
            providers.append(provider)
        }
    }

    func stops() -> [TransitStop] { nearbyStops }

    func arrivalsFor(stopId: String) -> [TransitArrival] { board[stopId] ?? [] }

    func allArrivals() -> [TransitArrival] {
        board.values.flatMap { $0 }.sorted { $0.expectedAtMs < $1.expectedAtMs }
    }

    func refresh(center: GeoPoint, nowMs: Int64, radiusM: Double = 800) {
        if nowMs - lastRefreshMs < refreshIntervalMs && !board.isEmpty { return }
        lastRefreshMs = nowMs

        var allStops: [TransitStop] = []
        var newBoard: [String: [TransitArrival]] = [:]
        for provider in providers {
            let providerStops = provider.stopsNear(center: center, radiusM: radiusM)
            for stop in providerStops {
                if !allStops.contains(where: { $0.id == stop.id }) { allStops.append(stop) }
                let arrivals = provider.arrivals(stopId: stop.id, nowMs: nowMs)
                newBoard[stop.id, default: []].append(contentsOf: arrivals)
            }
        }
        for key in newBoard.keys {
            newBoard[key]?.sort { $0.expectedAtMs < $1.expectedAtMs }
        }
        nearbyStops = allStops.sorted { haversineM(center, $0.point) < haversineM(center, $1.point) }
        board = newBoard
    }

    func reset() {
        board = [:]
        nearbyStops = []
        lastRefreshMs = 0
    }
}
