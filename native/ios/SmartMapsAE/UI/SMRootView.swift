//  SMRootView.swift
//  SM's layered shell on iOS, in the Smart Maps design language:
//
//    1. map layer     — the real MKMapView, persistent and full-screen
//    2. render layer  — the SceneKit/Metal 3D–7D surface, transparent above it
//    3. card layer    — modular cards (Live State, route, plan)
//    4. mode cluster  — Navigate / Transit / Plan as modes, not tabs
//    5. system layer  — SM's dev overlay (DEBUG builds only)
//
//  All state comes from SMNavigationController. The app holds no engine logic.

import SwiftUI
import SMCore
import CoreLocation

enum SMMode: String, CaseIterable, Identifiable {
    case navigate, transit, plan
    var id: String { rawValue }

    var label: String {
        switch self {
        case .navigate: return "Navigate"
        case .transit: return "Transit"
        case .plan: return "Plan"
        }
    }

    var symbol: String {
        switch self {
        case .navigate: return "location.north.line.fill"
        case .transit: return "bus.fill"
        case .plan: return "arrow.triangle.turn.up.right.diamond.fill"
        }
    }
}

private struct SMStat: Identifiable {
    let key: String
    let value: String
    var id: String { key }
}

struct SMRootView: View {
    @ObservedObject var sm: SMNavigationController

    @State private var activeMode: SMMode?
    @State private var query = ""
    @State private var showDevOverlay = false
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var isRegular: Bool { sizeClass == .regular }
    private var grid: CGFloat { isRegular ? 24 : 16 }

    var body: some View {
        ZStack {
            // 1. MAP LAYER — real MapKit, always present, never replaced.
            sm.mapView()
                .ignoresSafeArea()

            // 2. RENDER LAYER — SceneKit/Metal 3D–7D surface.
            sm.sceneView()
                .ignoresSafeArea()
                .allowsHitTesting(false)

            // 3–5. floating UI
            if isRegular { regularLayout } else { compactLayout }
        }
    }

    // MARK: - Layouts

    private var compactLayout: some View {
        VStack(spacing: grid) {
            searchBar
            Spacer()
            HStack { Spacer(); modeCluster(vertical: false) }
            cardStack
        }
        .padding(grid)
    }

    private var regularLayout: some View {
        HStack(alignment: .top, spacing: grid) {
            VStack(spacing: grid) {
                cardStack
                Spacer()
            }
            .frame(width: 360)

            VStack {
                searchBar.frame(maxWidth: 560)
                Spacer()
            }

            modeCluster(vertical: true)
        }
        .padding(grid)
    }

    // MARK: - Components

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.tint)
            TextField("Search places, stops, postcodes…", text: $query)
                .textFieldStyle(.plain)
            #if DEBUG
            Button {
                showDevOverlay.toggle()
            } label: {
                Image(systemName: showDevOverlay ? "ladybug.fill" : "ladybug")
            }
            .buttonStyle(.plain)
            #endif
        }
        .padding(.horizontal, 16)
        .frame(height: isRegular ? 56 : 52)
        .background(.regularMaterial, in: Capsule())
        .shadow(radius: 6, y: 2)
    }

    private func modeCluster(vertical: Bool) -> some View {
        let layout = vertical
            ? AnyLayout(VStackLayout(spacing: 12))
            : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            ForEach(SMMode.allCases) { mode in
                Button {
                    activeMode = (activeMode == mode) ? nil : mode
                } label: {
                    VStack(spacing: 2) {
                        Image(systemName: mode.symbol)
                        if isRegular {
                            Text(mode.label).font(.system(size: 9))
                        }
                    }
                    .frame(width: isRegular ? 64 : 48, height: isRegular ? 64 : 48)
                    .background(
                        activeMode == mode ? AnyShapeStyle(.tint) : AnyShapeStyle(.regularMaterial),
                        in: RoundedRectangle(cornerRadius: 16)
                    )
                    .foregroundStyle(activeMode == mode ? AnyShapeStyle(.white) : AnyShapeStyle(.tint))
                }
                .buttonStyle(.plain)
                .shadow(radius: 4, y: 2)
            }
        }
    }

    private var cardStack: some View {
        VStack(spacing: 8) {
            if activeMode == .navigate || sm.status.route != nil { navigateCard }
            if activeMode == .plan { planCard }
            liveStateCard
            #if DEBUG
            if showDevOverlay { sm.debugOverlay() }
            #endif
        }
    }

    private var navigateCard: some View {
        card {
            if let route = sm.status.route {
                Text(route.nextInstruction ?? "On route").font(.headline)
                Text("\(formatDistance(route.distanceRemainingM))  •  \(formatEta(route.etaSeconds))")
                    .font(.subheadline).foregroundStyle(.tint)
            } else {
                Text("Free drive").font(.headline)
                Text("Tracking live — set a destination to start guidance.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var planCard: some View {
        card {
            Text("Plan").font(.headline)
            Button("Route 1 km north-east") {
                if let here = sm.liveState.coordinate {
                    sm.setDestination(
                        coordinate: CLLocationCoordinate2D(
                            latitude: here.latitude + 0.009,
                            longitude: here.longitude + 0.009
                        ),
                        name: "Destination"
                    )
                }
            }
            .disabled(sm.liveState.coordinate == nil)
            if sm.status.route != nil {
                Button("Clear route") { sm.setDestination(nil) }
            }
        }
    }

    private var liveStateCard: some View {
        card {
            Text("LIVE STATE").font(.caption2.bold()).foregroundStyle(.secondary)

            let state = sm.liveState
            let stats: [SMStat] = [
                SMStat(key: "Position", value: state.coordinate.map {
                    String(format: "%.5f, %.5f", $0.latitude, $0.longitude)
                } ?? "acquiring…"),
                SMStat(key: "Accuracy", value: String(format: "±%.0f m", state.accuracyM)),
                SMStat(key: "Motion", value: state.motion.rawValue.capitalized),
                SMStat(key: "Confidence", value: String(format: "%.0f%%", state.confidence * 100)),
                SMStat(key: "Link", value: state.link.rawValue),
                SMStat(key: "Update", value: String(format: "%.1f Hz", state.updateHz)),
                SMStat(key: "Tier", value: sm.status.tier.displayName),
                SMStat(key: "Traffic", value: String(format: "%.0f%%", state.trafficLevel * 100))
            ]

            if isRegular {
                LazyVGrid(
                    columns: [GridItem(.flexible(), alignment: .leading),
                              GridItem(.flexible(), alignment: .leading)],
                    alignment: .leading, spacing: 6
                ) {
                    ForEach(stats) { cell($0.key, $0.value) }
                }
            } else {
                ForEach(Array(stats.prefix(6))) { stat in
                    HStack {
                        Text(stat.key).foregroundStyle(.secondary)
                        Spacer()
                        Text(stat.value).monospacedDigit()
                    }
                    .font(.caption)
                }
            }

            fusionStrip
        }
    }

    private var fusionStrip: some View {
        HStack(spacing: 10) {
            ForEach(SMPositionSource.allCases, id: \.self) { source in
                let live = sm.liveState.activeSources.contains(source)
                HStack(spacing: 3) {
                    Circle()
                        .fill(live ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary.opacity(0.3)))
                        .frame(width: 7, height: 7)
                    Text(source.rawValue)
                        .font(.system(size: 9))
                        .foregroundStyle(live ? AnyShapeStyle(.primary) : AnyShapeStyle(.secondary))
                }
            }
        }
    }

    private func cell(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(key.uppercased()).font(.system(size: 9)).foregroundStyle(.secondary)
            Text(value).font(.caption).monospacedDigit()
        }
    }

    private func card(@ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(isRegular ? 20 : 16)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .shadow(radius: 4, y: 2)
    }
}

private func formatDistance(_ m: Double) -> String {
    m >= 1000 ? String(format: "%.1f km", m / 1000) : String(format: "%.0f m", m)
}

private func formatEta(_ s: Double) -> String {
    let mins = Int(s / 60)
    return mins >= 60 ? "\(mins / 60) h \(mins % 60) min" : "\(mins) min"
}
