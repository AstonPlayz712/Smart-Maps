// SensorHub.swift — the only place iOS platform sensors are touched.
//
// CoreLocation (GPS/Wi-Fi/cell fused by the OS, fed as distinct accuracy
// tiers) + CoreMotion (user acceleration + rotation rate) push plain core
// models straight into AECore. No plugins, no bridges. A denied permission
// or missing sensor simply never reports — the core keeps running on
// whatever does.

import Foundation
import CoreLocation
import CoreMotion

public final class SensorHub: NSObject, CLLocationManagerDelegate {

    private let core: AECore
    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionManager()
    private var started = false

    public init(core: AECore) {
        self.core = core
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = kCLDistanceFilterNone
    }

    public func start() {
        guard !started else { return }
        started = true

        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()

        if motionManager.isDeviceMotionAvailable {
            motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
            motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
                guard let self, let motion else { return }
                let a = motion.userAcceleration
                // CoreMotion reports g — convert to m/s² to match the models.
                let accel = sqrt(a.x * a.x + a.y * a.y + a.z * a.z) * 9.81
                let r = motion.rotationRate
                let gyro = sqrt(r.x * r.x + r.y * r.y + r.z * r.z)
                self.core.pushMotion(MotionSample(
                    accelMagnitude: accel,
                    gyroMagnitude: gyro,
                    timestampMs: Int64(Date().timeIntervalSince1970 * 1000)
                ))
            }
        }
    }

    public func stop() {
        guard started else { return }
        started = false
        locationManager.stopUpdatingLocation()
        motionManager.stopDeviceMotionUpdates()
    }

    // ─── CLLocationManagerDelegate ───────────────────────────────────────────

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            guard location.horizontalAccuracy >= 0 else { continue }
            // Classify the OS fix by accuracy tier so fusion can weight the
            // provenance: tight = GNSS, mid = Wi-Fi, wide = cell.
            let source: FixSource
            switch location.horizontalAccuracy {
            case ..<30: source = .gps
            case ..<150: source = .wifi
            default: source = .cell
            }
            core.pushFix(RawFix(
                point: GeoPoint(lat: location.coordinate.latitude, lng: location.coordinate.longitude),
                accuracyM: location.horizontalAccuracy,
                speedMps: location.speed >= 0 ? location.speed : nil,
                bearingDeg: location.course >= 0 ? location.course : nil,
                source: source,
                timestampMs: Int64(location.timestamp.timeIntervalSince1970 * 1000)
            ))
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A failing provider simply stops reporting; fusion carries on with
        // whatever is still alive. Nothing to do here by design.
    }
}
