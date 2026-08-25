//  SMMapAdapter.swift
//  SmartMapsAE's own map renderer for iOS. MapKit has been removed entirely:
//  no MKMapView, no MKMapCamera, no Apple tiles or overlays.
//
//  This draws SM's own data — the same schema the web engine consumes —
//  through Core Graphics:
//
//    /maps/tiles/{z}/{x}/{y}.json      base vector tile
//    /maps/buildings/{z}/{x}/{y}.json  3D building meshes (extruded footprints)
//    /maps/indoors/{venueId}.json      indoor floor plans
//    /maps/poi/{z}/{x}/{y}.json        POI layer
//
//  Behaviour matches src/map/* on web line for line: identical tile→lng/lat
//  transform, identical floor clipping, identical accuracy-ring maths with the
//  same 80 pt clamp and indoor suppression, and the same debugMode gate for
//  internal layers.

import Foundation
import CoreLocation
import UIKit
import SwiftUI

// MARK: - Schema (mirrors src/map/types.ts)

struct SMTileCoord: Codable, Hashable {
    let z: Int
    let x: Int
    let y: Int
}

struct SMVectorFeature: Codable {
    let id: String
    let kind: String
    let geometry: [[[Double]]]
    let name: String?
    let `class`: String?
    let floorLevel: Int?
}

struct SMVectorTile: Codable {
    let format: String
    let coord: SMTileCoord
    let extent: Double
    let features: [SMVectorFeature]
}

struct SMBuildingMesh: Codable {
    let id: String
    let footprint: [[Double]]
    let heightM: Double
    let minHeightM: Double?
    let name: String?
    let venueId: String?
}

struct SMBuildingTile: Codable {
    let format: String
    let coord: SMTileCoord
    let extent: Double
    let buildings: [SMBuildingMesh]
}

struct SMPoiFeature: Codable {
    let id: String
    let name: String
    let category: String
    let position: [Double]
    let floorLevel: Int?
    let venueId: String?
}

struct SMPoiTile: Codable {
    let format: String
    let coord: SMTileCoord
    let extent: Double
    let pois: [SMPoiFeature]
}

struct SMLngLat: Codable {
    let lng: Double
    let lat: Double
}

struct SMIndoorFloor: Codable {
    let level: Int
    let name: String
    let elevationM: Double
    let outline: [SMLngLat]
    let walls: [[SMLngLat]]?
}

struct SMIndoorConnector: Codable {
    let id: String
    let kind: String
    let position: SMLngLat
    let floors: [Int]
    let secondsPerFloor: Double
}

struct SMIndoorVenue: Codable {
    let format: String
    let venueId: String
    let name: String
    let origin: SMLngLat
    let floors: [SMIndoorFloor]
    let connectors: [SMIndoorConnector]
}

// MARK: - Projection (identical maths to src/map/types.ts)

enum SMProjection {
    /// Tile-local units → lng/lat. Extent travels with the tile; y goes
    /// through the inverse Mercator, not a linear lerp — the same fix applied
    /// on web, so POIs land in the same place on both platforms.
    static func tileToLngLat(_ coord: SMTileCoord, extent: Double, x: Double, y: Double) -> CLLocationCoordinate2D {
        let scale = Double(1 << coord.z)
        let fx = (Double(coord.x) + x / extent) / scale
        let fy = (Double(coord.y) + y / extent) / scale
        let lng = fx * 360 - 180
        let n = Double.pi - 2 * Double.pi * fy
        let lat = (180 / Double.pi) * atan(0.5 * (exp(n) - exp(-n)))
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    static func lngLatToTileCoord(_ position: CLLocationCoordinate2D, z: Int) -> SMTileCoord {
        let scale = Double(1 << z)
        let sinLat = sin(position.latitude * Double.pi / 180)
        let x = Int(floor(((position.longitude + 180) / 360) * scale))
        let y = Int(floor((0.5 - log((1 + sinLat) / (1 - sinLat)) / (4 * Double.pi)) * scale))
        return SMTileCoord(z: z, x: x, y: y)
    }

    /// Ground resolution, metres per point — latitude-corrected.
    static func metresPerPoint(latitude: Double, zoom: Double) -> Double {
        (156543.03392 * cos(latitude * Double.pi / 180)) / pow(2, zoom)
    }
}

// MARK: - Tile source

/// Loads SM's own tiles. Relative paths by default so a bundled or
/// app-served map works without cross-origin rules getting involved.
final class SMTileSource {

    private let baseURL: URL?
    private var vectorCache: [SMTileCoord: SMVectorTile] = [:]
    private var buildingCache: [SMTileCoord: SMBuildingTile] = [:]
    private var poiCache: [SMTileCoord: SMPoiTile] = [:]
    private var venueCache: [String: SMIndoorVenue] = [:]
    private var inflight: Set<String> = []

    /// Called when new data lands, so the surface can redraw.
    var onLoad: (() -> Void)?

    init(baseURL: URL? = Bundle.main.url(forResource: "maps", withExtension: nil)) {
        self.baseURL = baseURL
    }

    func vectorTile(_ coord: SMTileCoord) -> SMVectorTile? {
        if let hit = vectorCache[coord] { return hit }
        load(path: "tiles/\(coord.z)/\(coord.x)/\(coord.y).json", key: "v\(coord)") { [weak self] data in
            guard let tile = try? JSONDecoder().decode(SMVectorTile.self, from: data) else { return }
            self?.vectorCache[coord] = tile
            self?.onLoad?()
        }
        return nil
    }

    func buildingTile(_ coord: SMTileCoord) -> SMBuildingTile? {
        if let hit = buildingCache[coord] { return hit }
        load(path: "buildings/\(coord.z)/\(coord.x)/\(coord.y).json", key: "b\(coord)") { [weak self] data in
            guard let tile = try? JSONDecoder().decode(SMBuildingTile.self, from: data) else { return }
            self?.buildingCache[coord] = tile
            self?.onLoad?()
        }
        return nil
    }

    func poiTile(_ coord: SMTileCoord) -> SMPoiTile? {
        if let hit = poiCache[coord] { return hit }
        load(path: "poi/\(coord.z)/\(coord.x)/\(coord.y).json", key: "p\(coord)") { [weak self] data in
            guard let tile = try? JSONDecoder().decode(SMPoiTile.self, from: data) else { return }
            self?.poiCache[coord] = tile
            self?.onLoad?()
        }
        return nil
    }

    func venue(_ venueId: String) -> SMIndoorVenue? {
        if let hit = venueCache[venueId] { return hit }
        load(path: "indoors/\(venueId).json", key: "n\(venueId)") { [weak self] data in
            guard let venue = try? JSONDecoder().decode(SMIndoorVenue.self, from: data) else { return }
            self?.venueCache[venueId] = venue
            self?.onLoad?()
        }
        return nil
    }

    /// A missing tile is normal (ocean, no buildings, no POIs) and must never
    /// throw — it simply means "nothing to draw here".
    private func load(path: String, key: String, then handle: @escaping (Data) -> Void) {
        guard let baseURL, !inflight.contains(key) else { return }
        inflight.insert(key)
        let url = baseURL.appendingPathComponent(path)
        DispatchQueue.global(qos: .utility).async { [weak self] in
            defer { DispatchQueue.main.async { self?.inflight.remove(key) } }
            guard let data = try? Data(contentsOf: url) else { return }
            DispatchQueue.main.async { handle(data) }
        }
    }
}

// MARK: - Indoor layer

/// Owns the active venue and floor. The single source of truth for "which
/// floor am I on", exactly as IndoorLayer.ts is on web.
final class SMIndoorLayer {
    private(set) var venue: SMIndoorVenue?
    private(set) var floorLevel: Int?

    func enter(venue: SMIndoorVenue, floor: Int? = nil) {
        self.venue = venue
        let levels = venue.floors.map(\.level).sorted()
        floorLevel = floor.flatMap { levels.contains($0) ? $0 : nil } ?? levels.first(where: { $0 == 0 }) ?? levels.first
    }

    func exit() {
        venue = nil
        floorLevel = nil
    }

    @discardableResult
    func setFloor(_ level: Int) -> Bool {
        guard let venue, venue.floors.contains(where: { $0.level == level }) else { return false }
        floorLevel = level
        return true
    }

    func currentFloor() -> SMIndoorFloor? {
        guard let venue, let floorLevel else { return nil }
        return venue.floors.first { $0.level == floorLevel }
    }

    /// The clipping rule for every floor-tagged feature — one predicate, so no
    /// layer can forget it and leak another floor's geometry.
    func isOnActiveFloor(_ level: Int?) -> Bool {
        guard let level else { return true }        // outdoor feature
        guard let floorLevel else { return false }  // indoor feature, no venue
        return level == floorLevel
    }
}

// MARK: - Surface

/// The drawing surface. Core Graphics keeps this dependency-free and identical
/// in behaviour to the web canvas backend.
final class SMMapSurfaceView: UIView {

    var camera = SMCamera(center: CLLocationCoordinate2D(latitude: 0, longitude: 0), zoom: 16, headingDeg: 0, pitchDeg: 45)
    var tiles: SMTileSource?
    var indoor = SMIndoorLayer()
    var routePoints: [CLLocationCoordinate2D] = []
    var destination: CLLocationCoordinate2D?
    var userPosition: CLLocationCoordinate2D?
    var accuracyM: Double = 0
    var verticalAccuracyM: Double = 0
    var floorLevel: Int?
    var buildings3D = true
    /// Internal engine layers are opt-in and default to off.
    var debugMode = false
    var debugReadout: [String] = []

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        ctx.setFillColor(UIColor.systemBackground.cgColor)
        ctx.fill(rect)

        let centre = SMProjection.lngLatToTileCoord(camera.center, z: Int(camera.zoom.rounded()))
        let mpp = SMProjection.metresPerPoint(latitude: camera.center.latitude, zoom: camera.zoom)

        // Tiles around the centre.
        for dx in -1...1 {
            for dy in -1...1 {
                let coord = SMTileCoord(z: centre.z, x: centre.x + dx, y: centre.y + dy)
                drawVector(coord, ctx: ctx, mpp: mpp)
                if buildings3D { drawBuildings(coord, ctx: ctx, mpp: mpp) }
                drawPois(coord, ctx: ctx, mpp: mpp)
            }
        }

        drawIndoor(ctx: ctx, mpp: mpp)
        drawRoute(ctx: ctx, mpp: mpp)
        drawAccuracyAndUser(ctx: ctx, mpp: mpp)
        if debugMode { drawDebug(ctx: ctx) }
    }

    // MARK: layers

    private func drawVector(_ coord: SMTileCoord, ctx: CGContext, mpp: Double) {
        guard let tile = tiles?.vectorTile(coord) else { return }
        ctx.setLineWidth(3)
        ctx.setStrokeColor(UIColor.label.withAlphaComponent(0.25).cgColor)
        for feature in tile.features {
            guard indoor.isOnActiveFloor(feature.floorLevel) else { continue }
            for ring in feature.geometry where ring.count >= 2 {
                let path = CGMutablePath()
                for (i, point) in ring.enumerated() where point.count >= 2 {
                    let p = screenPoint(SMProjection.tileToLngLat(coord, extent: tile.extent, x: point[0], y: point[1]), mpp: mpp)
                    if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
                }
                ctx.addPath(path)
                ctx.strokePath()
            }
        }
    }

    private func drawBuildings(_ coord: SMTileCoord, ctx: CGContext, mpp: Double) {
        guard let tile = tiles?.buildingTile(coord) else { return }
        let activeVenue = indoor.venue?.venueId
        for mesh in tile.buildings {
            // Indoors, another venue's shell would occlude the floor plan.
            if let activeVenue, let meshVenue = mesh.venueId, meshVenue != activeVenue { continue }
            guard mesh.footprint.count >= 3 else { continue }
            // Extrude by offsetting the roof ring — a cheap, reliable 3D read.
            let lift = CGFloat(mesh.heightM / max(mpp, 0.0001)) * 0.35
            let path = CGMutablePath()
            let roof = CGMutablePath()
            for (i, point) in mesh.footprint.enumerated() where point.count >= 2 {
                let p = screenPoint(SMProjection.tileToLngLat(coord, extent: tile.extent, x: point[0], y: point[1]), mpp: mpp)
                if i == 0 { path.move(to: p); roof.move(to: CGPoint(x: p.x, y: p.y - lift)) }
                else { path.addLine(to: p); roof.addLine(to: CGPoint(x: p.x, y: p.y - lift)) }
            }
            ctx.setFillColor(UIColor.label.withAlphaComponent(0.10).cgColor)
            ctx.addPath(path); ctx.fillPath()
            ctx.setFillColor(UIColor.label.withAlphaComponent(0.18).cgColor)
            ctx.addPath(roof); ctx.fillPath()
        }
    }

    private func drawPois(_ coord: SMTileCoord, ctx: CGContext, mpp: Double) {
        guard let tile = tiles?.poiTile(coord) else { return }
        ctx.setFillColor(UIColor.systemBlue.withAlphaComponent(0.8).cgColor)
        for poi in tile.pois where poi.position.count >= 2 {
            guard indoor.isOnActiveFloor(poi.floorLevel) else { continue }
            let p = screenPoint(SMProjection.tileToLngLat(coord, extent: tile.extent, x: poi.position[0], y: poi.position[1]), mpp: mpp)
            ctx.fillEllipse(in: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6))
        }
    }

    private func drawIndoor(ctx: CGContext, mpp: Double) {
        guard let floor = indoor.currentFloor() else { return }
        ctx.setFillColor(UIColor.systemTeal.withAlphaComponent(0.10).cgColor)
        ctx.setStrokeColor(UIColor.systemTeal.withAlphaComponent(0.65).cgColor)
        ctx.setLineWidth(2)
        let path = CGMutablePath()
        for (i, point) in floor.outline.enumerated() {
            let p = screenPoint(CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng), mpp: mpp)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        ctx.addPath(path); ctx.drawPath(using: .fillStroke)

        for wall in floor.walls ?? [] where wall.count >= 2 {
            let wp = CGMutablePath()
            for (i, point) in wall.enumerated() {
                let p = screenPoint(CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng), mpp: mpp)
                if i == 0 { wp.move(to: p) } else { wp.addLine(to: p) }
            }
            ctx.addPath(wp); ctx.strokePath()
        }
    }

    private func drawRoute(ctx: CGContext, mpp: Double) {
        guard routePoints.count >= 2 else { return }
        ctx.setStrokeColor(UIColor.systemBlue.withAlphaComponent(0.9).cgColor)
        ctx.setLineWidth(8)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        let path = CGMutablePath()
        for (i, coordinate) in routePoints.enumerated() {
            let p = screenPoint(coordinate, mpp: mpp)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        ctx.addPath(path); ctx.strokePath()

        if let destination {
            let p = screenPoint(destination, mpp: mpp)
            ctx.setFillColor(UIColor.systemBlue.cgColor)
            ctx.fillEllipse(in: CGRect(x: p.x - 6, y: p.y - 6, width: 12, height: 12))
        }
    }

    /// The accuracy ring.
    ///
    /// Metres are converted to points against the live zoom and latitude, and
    /// clamped to 80 pt — the uncapped ring was what produced the giant blue
    /// disc. Indoors the horizontal ring is suppressed entirely (satellite
    /// accuracy is meaningless under a roof) and vertical accuracy is drawn
    /// instead, matching AccuracyLayer.ts exactly.
    private func drawAccuracyAndUser(ctx: CGContext, mpp: Double) {
        guard let userPosition else { return }
        let p = screenPoint(userPosition, mpp: mpp)

        let indoors = floorLevel != nil
        let accuracy = indoors ? verticalAccuracyM : accuracyM
        if accuracy.isFinite && accuracy > 0 {
            let raw = accuracy / max(mpp, 0.0001)
            let radius = CGFloat(min(max(raw, 6), 80))
            ctx.setFillColor(UIColor.systemBlue.withAlphaComponent(indoors ? 0.10 : 0.16).cgColor)
            ctx.fillEllipse(in: CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2))
        }

        ctx.setFillColor(UIColor.systemBlue.cgColor)
        ctx.fillEllipse(in: CGRect(x: p.x - 7, y: p.y - 7, width: 14, height: 14))
    }

    /// Internal engine layers. Only ever reached when debugMode is true.
    private func drawDebug(ctx: CGContext) {
        let text = debugReadout.joined(separator: "\n") as NSString
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .regular),
            .foregroundColor: UIColor.systemGreen
        ]
        text.draw(in: CGRect(x: 8, y: 8, width: 260, height: 160), withAttributes: attrs)
    }

    // MARK: geometry

    /// lng/lat → view points, about the camera centre.
    private func screenPoint(_ coordinate: CLLocationCoordinate2D, mpp: Double) -> CGPoint {
        let earth = 6_371_000.0
        let cosLat = cos(camera.center.latitude * Double.pi / 180)
        let dx = (coordinate.longitude - camera.center.longitude) * Double.pi / 180 * earth * cosLat
        let dy = (coordinate.latitude - camera.center.latitude) * Double.pi / 180 * earth
        let scale = 1.0 / max(mpp, 0.0001)
        let rotation = -camera.headingDeg * Double.pi / 180
        let rx = dx * cos(rotation) - dy * sin(rotation)
        let ry = dx * sin(rotation) + dy * cos(rotation)
        return CGPoint(
            x: bounds.midX + CGFloat(rx * scale),
            y: bounds.midY - CGFloat(ry * scale)
        )
    }
}

struct SMCamera {
    var center: CLLocationCoordinate2D
    var zoom: Double
    var headingDeg: Double
    var pitchDeg: Double
}

// MARK: - Adapter

/// Binds SM's engine to its own renderer. The call surface is unchanged from
/// the MapKit implementation it replaces, so SMCoreEngine and
/// SMNavigationController needed no rework.
final class SMMapAdapter: NSObject, UIGestureRecognizerDelegate {

    let surface = SMMapSurfaceView(frame: .zero)
    private let profile: SMFidelityProfile
    private let tileSource = SMTileSource()

    private(set) var userIsInteracting = false

    init(profile: SMFidelityProfile) {
        self.profile = profile
        super.init()
        surface.tiles = tileSource
        surface.backgroundColor = .systemBackground
        surface.buildings3D = profile.renderingFidelity != .standard
        tileSource.onLoad = { [weak self] in self?.surface.setNeedsDisplay() }
        installGestures()
    }

    // MARK: camera

    func updateCamera(
        center: CLLocationCoordinate2D,
        headingDeg: Double,
        distance: CLLocationDistance,
        pitchDeg: Double,
        animated: Bool
    ) {
        guard !userIsInteracting else { return }
        surface.camera = SMCamera(
            center: center,
            zoom: Self.zoom(forDistance: distance),
            headingDeg: headingDeg,
            pitchDeg: pitchDeg
        )
        surface.userPosition = center
        surface.setNeedsDisplay()
    }

    func recenter() {
        userIsInteracting = false
        surface.setNeedsDisplay()
    }

    /// Camera distance in metres → zoom, so the engine's camera model is
    /// unchanged by the renderer swap.
    static func zoom(forDistance distance: CLLocationDistance) -> Double {
        let clamped = max(50, min(20_000, distance))
        return max(3, min(20, 20 - log2(clamped / 200)))
    }

    // MARK: content

    func setRoute(_ coordinates: [CLLocationCoordinate2D]) {
        surface.routePoints = coordinates
        surface.setNeedsDisplay()
    }

    func setDestination(_ destination: SMDestination?) {
        surface.destination = destination?.coordinate
        surface.setNeedsDisplay()
    }

    /// Position + accuracy for the ring, and the floor for indoor clipping.
    func setPosition(
        _ coordinate: CLLocationCoordinate2D?,
        accuracyM: Double,
        verticalAccuracyM: Double,
        floorLevel: Int?
    ) {
        surface.userPosition = coordinate
        surface.accuracyM = accuracyM
        surface.verticalAccuracyM = verticalAccuracyM
        surface.floorLevel = floorLevel
        if let floorLevel { surface.indoor.setFloor(floorLevel) }
        surface.setNeedsDisplay()
    }

    func enterVenue(_ venueId: String, floor: Int? = nil) {
        guard let venue = tileSource.venue(venueId) else { return }
        surface.indoor.enter(venue: venue, floor: floor)
        surface.setNeedsDisplay()
    }

    func exitVenue() {
        surface.indoor.exit()
        surface.setNeedsDisplay()
    }

    /// Internal engine layers — off unless explicitly enabled.
    func setDebugMode(_ enabled: Bool, readout: [String] = []) {
        surface.debugMode = enabled
        surface.debugReadout = readout
        surface.setNeedsDisplay()
    }

    // MARK: gestures

    private func installGestures() {
        for recognizer in [
            UIPanGestureRecognizer(target: self, action: #selector(handleGesture(_:))),
            UIPinchGestureRecognizer(target: self, action: #selector(handleGesture(_:))),
            UIRotationGestureRecognizer(target: self, action: #selector(handleGesture(_:)))
        ] as [UIGestureRecognizer] {
            recognizer.delegate = self
            surface.addGestureRecognizer(recognizer)
        }
    }

    @objc private func handleGesture(_ recognizer: UIGestureRecognizer) {
        switch recognizer.state {
        case .began, .changed:
            userIsInteracting = true
            if let pinch = recognizer as? UIPinchGestureRecognizer {
                surface.camera.zoom = max(3, min(20, surface.camera.zoom + log2(Double(pinch.scale))))
                pinch.scale = 1
                surface.setNeedsDisplay()
            }
        default:
            break
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }
}

// MARK: - SwiftUI bridge

/// Internal SwiftUI wrapper around SM's own surface. Vended by
/// SMNavigationController; the app never constructs it directly.
struct SMMapViewRepresentable: UIViewRepresentable {
    let adapter: SMMapAdapter

    func makeUIView(context: Context) -> SMMapSurfaceView { adapter.surface }
    func updateUIView(_ uiView: SMMapSurfaceView, context: Context) {}
}
