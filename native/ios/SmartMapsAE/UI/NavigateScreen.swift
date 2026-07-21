// NavigateScreen.swift — the native map surface + snapped position + live
// next instruction. No "start navigation" ceremony: an active route shows
// guidance, no route shows free-drive tracking. Automatic and dynamic.

import SwiftUI

struct NavigateScreen: View {
    @ObservedObject var core: AECore

    var body: some View {
        ZStack {
            MapSurface(
                graph: core.spatial.graph(),
                route: core.route,
                position: core.fix?.point,
                headingDeg: core.fix?.headingDeg ?? 0,
                onRoad: core.snap?.onRoad == true
            )
            .ignoresSafeArea(edges: .bottom)

            VStack {
                // Instruction banner — present exactly when a route is active.
                if core.route != nil, let step = core.nextStep {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(step.instruction).font(.headline)
                        Text("\(formatDistance(core.remainingM))  •  \(formatEta(core.remainingEtaS))")
                            .font(.subheadline)
                            .foregroundColor(.blue)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
                    .padding(16)
                }

                Spacer()

                // Tracking chip — snapped/off-road state, always live.
                HStack {
                    Text(trackingLabel)
                        .font(.caption.bold())
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color(.secondarySystemBackground)))
                    Spacer()
                }
                .padding(16)
            }
        }
    }

    private var trackingLabel: String {
        if core.fix == nil { return "Acquiring…" }
        if core.snap?.onRoad == true {
            let name = core.spatial.graph().edges.first { $0.id == core.snap?.edgeId }?.name ?? "road"
            return "On \(name)"
        }
        return "Off-road"
    }
}

func formatDistance(_ m: Double) -> String {
    m >= 1000 ? String(format: "%.1f km", m / 1000) : String(format: "%.0f m", m)
}

func formatEta(_ s: Double) -> String {
    let mins = Int(s / 60)
    return mins >= 60 ? "\(mins / 60) h \(mins % 60) min" : "\(mins) min"
}
