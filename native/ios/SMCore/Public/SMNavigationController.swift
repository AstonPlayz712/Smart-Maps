//  SMNavigationController.swift
//  THE public interface of SMCore. This class and the value types in
//  SMPublicTypes.swift are the entire public surface of the module: every
//  engine, adapter, renderer and the dev overlay behind it are `internal` and
//  cannot be referenced from the app target at all.
//
//  Public API
//    startNavigation()      — bring the engine up (sensors, tick loop, render)
//    stopNavigation()       — tear it down
//    setDestination(_:)     — route to a destination, or nil to clear
//    liveState              — SM's live readout
//    status                 — engine + fidelity status
//    mapView() / sceneView()— the native surfaces SM renders into
//
//  Everything else stays internal.

import Foundation
import SwiftUI
import CoreLocation

public final class SMNavigationController: ObservableObject {

    /// SM's live readout — coordinates, accuracy, motion, confidence, sources,
    /// update rate and the 3D–7D summary. Republished every engine tick.
    @Published public private(set) var liveState: SMLiveState

    /// Engine + fidelity status.
    @Published public private(set) var status: SMStatus

    private let engine: SMCoreEngine

    public init() {
        let engine = SMCoreEngine()
        self.engine = engine
        self.liveState = engine.liveState
        self.status = engine.status()
        // Engine callbacks already arrive on the main thread (the tick timer
        // runs on the main run loop; CoreLocation and CoreMotion deliver to
        // .main), so state republishes directly without a hop.
        engine.onUpdate = { [weak self] state in
            guard let self else { return }
            self.liveState = state
            self.status = engine.status()
        }
    }

    // MARK: - Navigation

    public func startNavigation() {
        engine.start()
        status = engine.status()
    }

    public func stopNavigation() {
        engine.stop()
        status = engine.status()
    }

    public func setDestination(_ destination: SMDestination?) {
        engine.setDestination(destination)
        status = engine.status()
    }

    /// Convenience for a raw coordinate.
    public func setDestination(coordinate: CLLocationCoordinate2D, name: String? = nil) {
        setDestination(SMDestination(coordinate: coordinate, name: name))
    }

    // MARK: - Readouts

    public func getLiveState() -> SMLiveState { liveState }

    public func getStatus() -> SMStatus { status }

    // MARK: - Native surfaces

    /// The real MKMapView SM drives. Members of the one public interface —
    /// the map adapter itself stays internal.
    public func mapView() -> AnyView {
        AnyView(SMMapViewRepresentable(adapter: engine.mapAdapter))
    }

    /// The SceneKit/Metal surface carrying the 3D–7D render layers.
    public func sceneView() -> AnyView {
        AnyView(SMSceneViewRepresentable(engine: engine.rendering))
    }

    /// Return the camera to engine control after the user has panned the map.
    public func recenterMap() {
        engine.mapAdapter.recenter()
    }

    // MARK: - Developer overlay (DEBUG only)

    #if DEBUG
    /// SM's internal dev overlay. Compiled out of release builds entirely, so
    /// it is never part of the shipped public API.
    public func debugOverlay() -> AnyView {
        AnyView(
            SMDebugOverlayView(
                liveState: liveState,
                status: status,
                dimensions: engine.latestDimensions
            )
        )
    }
    #endif
}
