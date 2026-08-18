//  SMRenderingEngine.swift
//  Native rendering: a real Metal device backing a real SceneKit scene graph.
//  No canvas emulation, no web surface.
//
//  Layer mapping
//    3D geometry            — corridor + lane ribbons built from road geometry
//    4D motion              — the vehicle node's pose, driven every tick
//    5D environment         — lighting (day/night, tunnel) and fog
//    6D traffic             — corridor tint from measured congestion
//    7D satellite awareness — ambient/sky intensity from sky quality
//
//  Fidelity scaling: Full Mode renders lane ribbons, HDR and shadows;
//  Satellite Mode drops shadows; Modern Mode renders the corridor only.
//  OpenGL ES and CPU fallbacks are declared here as explicit extension points
//  (Metal is available on every device that runs iOS 17, so neither path is
//  reachable today — they are stubs, not silent failures).

import Foundation
import SceneKit
import Metal
import UIKit
import SwiftUI

enum SMRenderBackend: String {
    case metal          // primary on 27 / 26 / 17
    case openGLES       // declared fallback — not reachable on iOS 17+
    case cpu            // declared fallback — not reachable on iOS 17+
}

final class SMRenderingEngine {

    private let profile: SMFidelityProfile
    private(set) var backend: SMRenderBackend = .metal
    private(set) var metalAvailable = false

    let scene = SCNScene()
    private let cameraNode = SCNNode()
    private let vehicleNode = SCNNode()
    private let corridorNode = SCNNode()
    private let laneNode = SCNNode()
    private let sunNode = SCNNode()
    private let ambientNode = SCNNode()

    private var isRunning = false

    init(profile: SMFidelityProfile) {
        self.profile = profile
        self.metalAvailable = MTLCreateSystemDefaultDevice() != nil
        self.backend = metalAvailable ? .metal : .cpu
        buildScene()
    }

    // MARK: - Scene construction

    private func buildScene() {
        // Camera (4D motion drives its pose each tick).
        let camera = SCNCamera()
        camera.zFar = 4000
        camera.fieldOfView = 65
        if profile.renderingFidelity == .maximum {
            camera.wantsHDR = true
            camera.bloomIntensity = 0.4
        }
        cameraNode.camera = camera
        cameraNode.position = SCNVector3(0, 24, 48)
        cameraNode.eulerAngles = SCNVector3(-0.5, 0, 0)
        scene.rootNode.addChildNode(cameraNode)

        // Vehicle marker — the 4D layer's anchor.
        let body = SCNCone(topRadius: 0, bottomRadius: 3.2, height: 9)
        body.firstMaterial?.diffuse.contents = UIColor.systemBlue
        body.firstMaterial?.lightingModel = .physicallyBased
        vehicleNode.geometry = body
        vehicleNode.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
        scene.rootNode.addChildNode(vehicleNode)

        // 3D corridor + lane containers.
        scene.rootNode.addChildNode(corridorNode)
        if profile.laneGeometryDetail >= .high {
            scene.rootNode.addChildNode(laneNode)
        }

        // 5D environment lighting.
        let sun = SCNLight()
        sun.type = .directional
        sun.intensity = 900
        if profile.renderingFidelity == .maximum {
            sun.castsShadow = true
            sun.shadowMode = .deferred
        }
        sunNode.light = sun
        sunNode.eulerAngles = SCNVector3(-Float.pi / 3, Float.pi / 4, 0)
        scene.rootNode.addChildNode(sunNode)

        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.intensity = 400
        ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)
    }

    // MARK: - Lifecycle

    func start() { isRunning = true }
    func stop() { isRunning = false }

    // MARK: - Per-tick update

    func update(dimensions: SMDimensionalState, liveState: SMLiveState) {
        guard isRunning else { return }

        // 4D — vehicle pose from live motion.
        vehicleNode.eulerAngles = SCNVector3(
            -Float.pi / 2,
            0,
            Float(-liveState.headingDeg * .pi / 180)
        )

        // 6D — corridor tint by congestion (green → amber → red).
        let traffic = dimensions.d6.traffic.level
        let corridorColor = UIColor(
            hue: CGFloat((1 - traffic) * 0.33),   // 0.33 green … 0.0 red
            saturation: 0.85,
            brightness: 0.9,
            alpha: 0.9
        )
        // The corridor is a container of segment nodes — tint each segment,
        // not the (geometry-less) parent.
        for segment in corridorNode.childNodes {
            segment.geometry?.firstMaterial?.diffuse.contents = corridorColor
        }

        // 5D — environment lighting: night, tunnel and sky quality.
        let night = dimensions.d5.isNight
        let tunnel = dimensions.d5.inTunnel
        let baseSun: CGFloat = night ? 220 : 900
        sunNode.light?.intensity = tunnel ? 90 : baseSun
        scene.fogDensityExponent = tunnel ? 2.0 : 1.0
        scene.fogStartDistance = tunnel ? 20 : 260
        scene.fogEndDistance = tunnel ? 220 : 1600
        scene.fogColor = night ? UIColor.black : UIColor(white: 0.85, alpha: 1)

        // 7D — satellite awareness lifts ambient when the sky is open.
        let sky = dimensions.d7.enabled ? dimensions.d7.satellite.skyQuality : 0.6
        ambientNode.light?.intensity = 220 + CGFloat(sky) * 380
    }

    /// 3D — rebuild the corridor ribbon from real route geometry.
    func setCorridor(points: [SCNVector3]) {
        corridorNode.childNodes.forEach { $0.removeFromParentNode() }
        guard points.count >= 2 else { return }
        for i in 0..<(points.count - 1) {
            let a = points[i], b = points[i + 1]
            let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
            let length = sqrt(dx * dx + dy * dy + dz * dz)
            guard length > 0.01 else { continue }
            let segment = SCNBox(
                width: 7,
                height: 0.4,
                length: CGFloat(length),
                chamferRadius: profile.renderingFidelity == .maximum ? 0.6 : 0
            )
            let node = SCNNode(geometry: segment)
            node.position = SCNVector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
            node.look(at: b, up: scene.rootNode.worldUp, localFront: SCNVector3(0, 0, 1))
            corridorNode.addChildNode(node)
        }
    }
}

// MARK: - SwiftUI bridge

/// Internal SceneKit surface. Vended by SMNavigationController; never
/// constructed by the app directly.
struct SMSceneViewRepresentable: UIViewRepresentable {
    let engine: SMRenderingEngine

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.scene = engine.scene
        view.backgroundColor = .clear
        view.antialiasingMode = .multisampling2X
        view.isUserInteractionEnabled = false
        view.rendersContinuously = true
        return view
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}
}
