// SmartMapsAEApp.swift — app entry. Boots the A/E core, wires the sensor
// hub, and hosts the four native screens in a TabView. This file and
// SensorHub are the only places the iOS platform is touched directly —
// no WebView, no bridge, no plugins.

import SwiftUI

@main
struct SmartMapsAEApp: App {
    @StateObject private var core: AECore
    private let sensorHub: SensorHub

    @State private var selectedTab = 0

    init() {
        let core = AECore()
        _core = StateObject(wrappedValue: core)
        sensorHub = SensorHub(core: core)
        core.start()
        sensorHub.start()
    }

    var body: some Scene {
        WindowGroup {
            TabView(selection: $selectedTab) {
                HomeScreen(
                    core: core,
                    onNavigate: { selectedTab = 1 },
                    onTransit: { selectedTab = 2 },
                    onPlanner: { selectedTab = 3 }
                )
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(0)

                NavigateScreen(core: core)
                    .tabItem { Label("Navigate", systemImage: "location.north.line.fill") }
                    .tag(1)

                TransitScreen(core: core)
                    .tabItem { Label("Transit", systemImage: "bus.fill") }
                    .tag(2)

                JourneyPlannerScreen(core: core, onRoutePlanned: { selectedTab = 1 })
                    .tabItem { Label("Plan", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
                    .tag(3)
            }
        }
    }
}
