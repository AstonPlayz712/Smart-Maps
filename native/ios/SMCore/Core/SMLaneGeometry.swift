//  SMLaneGeometry.swift
//  Lane-level geometry derived from the road graph. Detail scales with the
//  fidelity profile: Modern resolves the carriageway, Satellite adds lane
//  centre-lines, Full adds lane-level offsets and predicted lane selection.

import Foundation
import CoreLocation

struct SMLane {
    let index: Int              // 0 = leftmost in travel direction
    /// Lateral offset of this lane's centre from the edge centreline, metres.
    let offsetM: Double
    let widthM: Double
}

struct SMLaneGeometryResult {
    let lanes: [SMLane]
    /// The lane SM believes the vehicle is in, if resolvable.
    let currentLaneIndex: Int?
    /// Centre-line of the current lane, when detail allows.
    let laneCenter: CLLocationCoordinate2D?
}

final class SMLaneGeometryEngine {

    private let profile: SMFidelityProfile
    private let defaultLaneWidthM = 3.5

    init(profile: SMFidelityProfile) {
        self.profile = profile
    }

    /// Resolve lanes for the edge the vehicle is matched to.
    func resolve(
        snap: SnapResult?,
        graph: RoadGraph,
        headingDeg: Double,
        prediction: SMMotionPrediction?
    ) -> SMLaneGeometryResult {
        guard let snap, snap.onRoad,
              let edge = graph.edges.first(where: { $0.id == snap.edgeId }) else {
            return SMLaneGeometryResult(lanes: [], currentLaneIndex: nil, laneCenter: nil)
        }

        // Lane count from the road class the graph carries (speed limit is the
        // proxy the offline graph provides today).
        let laneCount: Int
        switch profile.laneGeometryDetail {
        case .standard:
            laneCount = 1                                    // carriageway only
        case .high:
            laneCount = edge.speedLimitMps > 20 ? 3 : 2
        case .maximum:
            laneCount = edge.speedLimitMps > 25 ? 4 : (edge.speedLimitMps > 15 ? 3 : 2)
        }

        let total = Double(laneCount) * defaultLaneWidthM
        let lanes = (0..<laneCount).map { i in
            SMLane(
                index: i,
                offsetM: (Double(i) + 0.5) * defaultLaneWidthM - total / 2,
                widthM: defaultLaneWidthM
            )
        }

        // Which lane are we in? Standard detail can't tell; higher detail uses
        // the snap's lateral offset, and Full Mode biases toward the lane the
        // predicted turn implies.
        var currentIndex: Int?
        if profile.laneGeometryDetail >= .high {
            let lateral = snap.lateralOffsetM
            currentIndex = lanes.min(by: {
                abs($0.offsetM - lateral) < abs($1.offsetM - lateral)
            })?.index

            if profile.laneGeometryDetail == .maximum,
               let prediction, abs(prediction.turnRateDegPerS) > 6,
               let current = currentIndex {
                // Sustained turn → expect the corresponding outer/inner lane.
                let bias = prediction.turnRateDegPerS > 0 ? 1 : -1
                currentIndex = max(0, min(laneCount - 1, current + bias))
            }
        }

        return SMLaneGeometryResult(
            lanes: lanes,
            currentLaneIndex: currentIndex,
            laneCenter: profile.laneGeometryDetail >= .high ? snap.point.clCoordinate : nil
        )
    }
}

// MARK: - Bridging

extension GeoPoint {
    var clCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
    init(_ coordinate: CLLocationCoordinate2D) {
        self.init(lat: coordinate.latitude, lng: coordinate.longitude)
    }
}
