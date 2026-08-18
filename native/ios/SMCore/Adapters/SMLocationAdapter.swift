//  SMLocationAdapter.swift
//  Binds SM to REAL CoreLocation. This is the only place in SMCore that talks
//  to CLLocationManager. No simulated fixes, no fake providers: everything
//  downstream consumes what the OS actually reports.
//
//  CoreLocation fuses GNSS / Wi-Fi / cell internally and reports one location;
//  SM recovers the provenance from the accuracy tier so the Live State fusion
//  strip reflects what actually carried the fix.

import Foundation
import CoreLocation

protocol SMLocationAdapterDelegate: AnyObject {
    func locationAdapter(_ adapter: SMLocationAdapter, didUpdate fix: SMRawFix)
    func locationAdapter(_ adapter: SMLocationAdapter, didChangeAuthorization authorized: Bool)
}

/// One reading straight from CoreLocation, tagged with its inferred source.
struct SMRawFix {
    let coordinate: CLLocationCoordinate2D
    let altitude: CLLocationDistance
    let accuracyM: Double
    let verticalAccuracyM: Double
    /// Course over ground, degrees. nil when CoreLocation can't resolve it.
    let courseDeg: Double?
    /// Compass/true heading, degrees. nil when no heading feed.
    let headingDeg: Double?
    let speedMps: Double?
    let speedAccuracy: Double
    let source: SMPositionSource
    let timestamp: Date
}

final class SMLocationAdapter: NSObject, CLLocationManagerDelegate {

    weak var delegate: SMLocationAdapterDelegate?

    private let manager = CLLocationManager()
    private(set) var isAuthorized = false
    private(set) var lastFix: SMRawFix?
    private(set) var lastHeadingDeg: Double?

    private let profile: SMFidelityProfile

    init(profile: SMFidelityProfile) {
        self.profile = profile
        super.init()
        manager.delegate = self
        // Navigation-grade accuracy on every tier; the fidelity profile scales
        // what SM *does* with the fix, never how honestly it asks for it.
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
    }

    // MARK: - Lifecycle

    func start() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() {
            manager.startUpdatingHeading()
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            isAuthorized = true
        default:
            isAuthorized = false
        }
        delegate?.locationAdapter(self, didChangeAuthorization: isAuthorized)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            guard location.horizontalAccuracy >= 0 else { continue }
            let fix = SMRawFix(
                coordinate: location.coordinate,
                altitude: location.altitude,
                accuracyM: location.horizontalAccuracy,
                verticalAccuracyM: location.verticalAccuracy,
                courseDeg: location.course >= 0 ? location.course : nil,
                headingDeg: lastHeadingDeg,
                speedMps: location.speed >= 0 ? location.speed : nil,
                speedAccuracy: location.speedAccuracy,
                source: Self.source(forAccuracy: location.horizontalAccuracy),
                timestamp: location.timestamp
            )
            lastFix = fix
            delegate?.locationAdapter(self, didUpdate: fix)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        lastHeadingDeg = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A failing provider simply stops reporting; the core keeps running on
        // dead reckoning. Nothing to recover here by design.
    }

    // MARK: - Provenance

    /// CoreLocation reports one fused location; the accuracy tier is the honest
    /// signal of which radio actually carried it.
    static func source(forAccuracy accuracy: CLLocationAccuracy) -> SMPositionSource {
        switch accuracy {
        case ..<30: return .gnss
        case ..<150: return .wifi
        default: return .cell
        }
    }

    /// Confidence in this fix: accuracy quality scaled by freshness.
    static func confidence(for fix: SMRawFix, now: Date = Date()) -> Double {
        let accuracyScore = max(0, min(1, (60 - fix.accuracyM) / 55))
        let age = now.timeIntervalSince(fix.timestamp)
        let freshness = max(0, min(1, 1 - age / 3.0))
        return accuracyScore * (0.4 + 0.6 * freshness)
    }
}
