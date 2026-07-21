// JourneyPlannerScreen.swift — start → destination over the offline road
// graph. Start defaults to the live fused position (automatic); destination
// accepts "lat, lng" today, with place search activating when a geocoder
// module exists.

import SwiftUI

struct JourneyPlannerScreen: View {
    @ObservedObject var core: AECore
    let onRoutePlanned: () -> Void

    @State private var destText = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Journey planner").font(.title2.bold())

            Text(fromLabel).font(.subheadline)

            TextField("Destination (lat, lng)", text: $destText)
                .textFieldStyle(.roundedBorder)
                .onChange(of: destText) { _ in error = nil }
            if let error {
                Text(error).font(.caption).foregroundColor(.red)
            }

            HStack(spacing: 12) {
                Button("Plan route") { plan() }
                    .buttonStyle(.borderedProminent)
                    .disabled(core.fix == nil)
                if core.route != nil {
                    Button("Clear") { core.clearRoute() }
                        .buttonStyle(.bordered)
                }
            }

            if let route = core.route {
                Text("\(formatDistance(route.distanceM))  •  \(formatEta(route.etaS))")
                    .font(.headline)
                    .foregroundColor(.blue)
                List(route.steps.indices, id: \.self) { i in
                    let step = route.steps[i]
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.instruction).font(.body)
                        Text("\(formatDistance(step.distanceM)) from start")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                .listStyle(.plain)
            }

            Spacer()
        }
        .padding(20)
    }

    private var fromLabel: String {
        if let fix = core.fix {
            return String(format: "From: %.5f, %.5f (current position)", fix.point.lat, fix.point.lng)
        }
        return "From: acquiring position…"
    }

    private func plan() {
        guard let dest = parseLatLng(destText) else {
            error = "Enter as: 51.5074, -0.1278"
            return
        }
        if core.navigateTo(dest) == nil {
            error = "No route found on the offline graph"
        } else {
            onRoutePlanned()
        }
    }

    private func parseLatLng(_ text: String) -> GeoPoint? {
        let parts = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2,
              let lat = Double(parts[0]), let lng = Double(parts[1]),
              (-90...90).contains(lat), (-180...180).contains(lng) else { return nil }
        return GeoPoint(lat: lat, lng: lng)
    }
}
