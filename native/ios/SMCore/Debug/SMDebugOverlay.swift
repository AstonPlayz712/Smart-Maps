//  SMDebugOverlay.swift
//  SM's own internal developer overlay — the replacement for the external
//  debug logic that used to be scattered through the app. It is internal to
//  SMCore and only reachable through a DEBUG-only accessor on
//  SMNavigationController, so it cannot ship in a release build's public API.

import SwiftUI

struct SMDebugOverlayView: View {

    let liveState: SMLiveState
    let status: SMStatus
    let dimensions: SMDimensionalState?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header

            group("Fidelity") {
                row("Tier", status.tierDescription)
                row("DR", status.deadReckoningVersion)
                row("Prediction", status.motionPredictionEnabled ? "on (27)" : "off")
                row("Satellite", status.satelliteEngineEnabled ? "on" : "off")
                row("Metal", status.metalAvailable ? "available" : "unavailable")
            }

            group("Positioning") {
                row("Link", liveState.link.rawValue)
                row("Accuracy", String(format: "±%.0f m", liveState.accuracyM))
                row("Sources", liveState.activeSources.map(\.rawValue).sorted().joined(separator: "+"))
                row("Update", String(format: "%.1f Hz", liveState.updateHz))
            }

            group("Dimensions") {
                row("3D lane", liveState.laneIndex.map(String.init) ?? "—")
                row("3D level", String(liveState.roadLevel))
                row("4D motion", "\(liveState.motion.rawValue) \(Int(liveState.confidence * 100))%")
                row("5D env", String(format: "%.2f", liveState.environmentScore))
                row("6D traffic", String(format: "%.2f", liveState.trafficLevel))
                row("7D sky", String(format: "%.2f", liveState.satelliteQuality))
            }

            if let dimensions {
                group("Flags") {
                    row("Tunnel", dimensions.d5.inTunnel ? "yes" : "no")
                    row("Canyon", dimensions.d5.urbanCanyon ? "yes" : "no")
                    row("Outage", dimensions.d7.satellite.outage ? "yes" : "no")
                }
            }
        }
        .font(.system(size: 10, weight: .regular, design: .monospaced))
        .foregroundStyle(.white)
        .padding(10)
        .background(Color.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 10))
        .frame(maxWidth: 260, alignment: .leading)
    }

    private var header: some View {
        Text("SM DEV OVERLAY")
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .foregroundStyle(.cyan)
    }

    private func group(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundStyle(.cyan.opacity(0.8))
            content()
        }
    }

    private func row(_ key: String, _ value: String) -> some View {
        HStack {
            Text(key).foregroundStyle(.white.opacity(0.6))
            Spacer(minLength: 8)
            Text(value)
        }
    }
}
