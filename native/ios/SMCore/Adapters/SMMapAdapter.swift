//  SMMapAdapter.swift
//  Binds SM to REAL MapKit. Replaces the previous hand-drawn Canvas surface:
//  this is an actual MKMapView with Apple's tiles, buildings and terrain,
//  driven by the SM camera model.
//
//  Owns: the MKMapView, camera control, overlays (route + lane geometry),
//  annotations (destination), and gesture arbitration (a user pan suspends
//  auto-follow until re-centre).

import Foundation
import MapKit
import UIKit
import SwiftUI

final class SMMapAdapter: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {

    let mapView = MKMapView(frame: .zero)
    private let profile: SMFidelityProfile

    /// True while the user is driving the camera by hand.
    private(set) var userIsInteracting = false
    private var routeOverlay: MKPolyline?
    private var destinationAnnotation: MKPointAnnotation?

    init(profile: SMFidelityProfile) {
        self.profile = profile
        super.init()
        configure()
    }

    // MARK: - Configuration

    private func configure() {
        mapView.delegate = self
        // Real user location, drawn by MapKit from CoreLocation.
        mapView.showsUserLocation = true
        mapView.showsCompass = true
        mapView.showsScale = true
        mapView.isRotateEnabled = true
        mapView.isPitchEnabled = true
        mapView.pointOfInterestFilter = .includingAll

        applyMapConfiguration()
        installGestureObservers()
    }

    /// Map configuration scales with the fidelity tier: Satellite/Full tiers
    /// get realistic elevation and satellite-derived imagery awareness;
    /// Modern tier stays on the flat standard style.
    private func applyMapConfiguration() {
        switch profile.tier {
        case .full, .satellite:
            let config = MKStandardMapConfiguration(elevationStyle: .realistic, emphasisStyle: .default)
            config.showsTraffic = true
            mapView.preferredConfiguration = config
        case .modern:
            let config = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .default)
            config.showsTraffic = true
            mapView.preferredConfiguration = config
        }
    }

    /// Satellite-aware imagery, used by the 7D satellite engine on 26/27.
    func setSatelliteImagery(_ enabled: Bool) {
        guard profile.satelliteEngineEnabled else { return }
        if enabled {
            mapView.preferredConfiguration = MKHybridMapConfiguration(elevationStyle: .realistic)
        } else {
            applyMapConfiguration()
        }
    }

    // MARK: - Camera control

    /// Drive the camera from the engine. Ignored while the user is panning.
    func updateCamera(
        center: CLLocationCoordinate2D,
        headingDeg: Double,
        distance: CLLocationDistance,
        pitchDeg: Double,
        animated: Bool
    ) {
        guard !userIsInteracting else { return }
        let camera = MKMapCamera(
            lookingAtCenter: center,
            fromDistance: distance,
            pitch: CGFloat(pitchDeg),
            heading: headingDeg
        )
        mapView.setCamera(camera, animated: animated)
    }

    func recenter() {
        userIsInteracting = false
    }

    // MARK: - Overlays + annotations

    func setRoute(_ coordinates: [CLLocationCoordinate2D]) {
        if let existing = routeOverlay {
            mapView.removeOverlay(existing)
            routeOverlay = nil
        }
        guard coordinates.count >= 2 else { return }
        let polyline = MKPolyline(coordinates: coordinates, count: coordinates.count)
        routeOverlay = polyline
        mapView.addOverlay(polyline, level: .aboveRoads)
    }

    func setDestination(_ destination: SMDestination?) {
        if let existing = destinationAnnotation {
            mapView.removeAnnotation(existing)
            destinationAnnotation = nil
        }
        guard let destination else { return }
        let annotation = MKPointAnnotation()
        annotation.coordinate = destination.coordinate
        annotation.title = destination.name ?? "Destination"
        destinationAnnotation = annotation
        mapView.addAnnotation(annotation)
    }

    // MARK: - MKMapViewDelegate

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let polyline = overlay as? MKPolyline else {
            return MKOverlayRenderer(overlay: overlay)
        }
        let renderer = MKPolylineRenderer(polyline: polyline)
        renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.9)
        // Route ribbon thickens with rendering fidelity.
        renderer.lineWidth = profile.renderingFidelity == .maximum ? 10 : 7
        renderer.lineCap = .round
        renderer.lineJoin = .round
        return renderer
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard !(annotation is MKUserLocation) else { return nil }
        let id = "sm.destination"
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: id) as? MKMarkerAnnotationView
            ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: id)
        view.annotation = annotation
        view.markerTintColor = .systemBlue
        view.glyphImage = UIImage(systemName: "flag.fill")
        view.canShowCallout = true
        return view
    }

    // MARK: - Gestures

    private func installGestureObservers() {
        // Any direct manipulation suspends engine-driven camera updates until
        // the app calls recenter().
        for recognizer in [
            UIPanGestureRecognizer(target: self, action: #selector(handleUserGesture(_:))),
            UIPinchGestureRecognizer(target: self, action: #selector(handleUserGesture(_:))),
            UIRotationGestureRecognizer(target: self, action: #selector(handleUserGesture(_:)))
        ] as [UIGestureRecognizer] {
            recognizer.delegate = self
            mapView.addGestureRecognizer(recognizer)
        }
    }

    @objc private func handleUserGesture(_ recognizer: UIGestureRecognizer) {
        switch recognizer.state {
        case .began, .changed:
            userIsInteracting = true
        default:
            break
        }
    }

    /// Run alongside MapKit's own recognizers rather than stealing input.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }
}

// MARK: - SwiftUI bridge

/// Internal SwiftUI wrapper around the real MKMapView. The app never
/// constructs this directly — SMNavigationController vends it.
struct SMMapViewRepresentable: UIViewRepresentable {
    let adapter: SMMapAdapter

    func makeUIView(context: Context) -> MKMapView { adapter.mapView }
    func updateUIView(_ uiView: MKMapView, context: Context) {}
}
