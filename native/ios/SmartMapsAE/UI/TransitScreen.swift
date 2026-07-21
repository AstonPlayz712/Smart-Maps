// TransitScreen.swift — live arrivals/departures around the fused position.
// The board is exactly what the registered feed providers know right now;
// live rows are marked live, timetable rows aren't, and an empty board means
// no provider has data here.

import SwiftUI

struct TransitScreen: View {
    @ObservedObject var core: AECore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Departures").font(.title2.bold())

            if core.arrivals.isEmpty {
                Text("No arrivals known here yet — the board fills automatically as transport feeds report.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
            } else {
                List(core.arrivals) { arrival in
                    ArrivalRow(arrival: arrival)
                }
                .listStyle(.plain)
            }
        }
        .padding(20)
    }
}

private struct ArrivalRow: View {
    let arrival: TransitArrival

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(modeLabel) \(arrival.line) → \(arrival.destination)")
                    .font(.subheadline.bold())
                Text(arrival.live ? "live" : "timetable")
                    .font(.caption2)
                    .foregroundColor(arrival.live ? .blue : .secondary)
            }
            Spacer()
            Text(minutesLabel)
                .font(.headline)
                .foregroundColor(.blue)
        }
        .padding(.vertical, 4)
    }

    private var modeLabel: String {
        switch arrival.mode {
        case .bus: return "Bus"
        case .train: return "Train"
        case .tube: return "Tube"
        case .tram: return "Tram"
        case .ferry: return "Ferry"
        }
    }

    private var minutesLabel: String {
        let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
        let mins = max(0, (arrival.expectedAtMs - nowMs) / 60000)
        return mins == 0 ? "due" : "\(mins) min"
    }
}
