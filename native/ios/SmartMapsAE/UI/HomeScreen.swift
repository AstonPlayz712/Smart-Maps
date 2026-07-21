// HomeScreen.swift — search + quick modes.
//
// Everything reflects live engine state: the status card is the fused fix +
// movement estimate; quick modes jump straight into the live screens.

import SwiftUI

struct HomeScreen: View {
    @ObservedObject var core: AECore
    let onNavigate: () -> Void
    let onTransit: () -> Void
    let onPlanner: () -> Void

    @State private var query = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Smart Maps A/E")
                .font(.largeTitle.bold())

            TextField("Search places, stops, postcodes…", text: $query)
                .textFieldStyle(.roundedBorder)

            HStack(spacing: 12) {
                quickMode("location.north.line.fill", "Navigate", onNavigate)
                quickMode("bus.fill", "Transit", onTransit)
                quickMode("arrow.triangle.turn.up.right.diamond.fill", "Plan", onPlanner)
            }

            Spacer()

            // Live engine status — automatic, no refresh button anywhere.
            VStack(alignment: .leading, spacing: 4) {
                Text("Live state").font(.caption.bold())
                if let fix = core.fix {
                    Text(String(
                        format: "%.5f, %.5f  ±%.0fm  •  %@",
                        fix.point.lat, fix.point.lng, fix.accuracyM,
                        fix.sources.map(\.rawValue).joined(separator: "+")
                    ))
                    .font(.caption)
                } else {
                    Text("Acquiring position…").font(.caption)
                }
                Text(motionLabel + String(format: "  •  confidence %.0f%%", core.movementState.confidence * 100))
                    .font(.caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        }
        .padding(20)
    }

    private var motionLabel: String {
        switch core.movementState.state {
        case .still: return "Still"
        case .walking: return "Walking"
        case .driving: return "Driving"
        case .unknown: return "Motion unknown"
        }
    }

    private func quickMode(_ systemImage: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                Text(label).font(.caption.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        }
        .buttonStyle(.plain)
    }
}
