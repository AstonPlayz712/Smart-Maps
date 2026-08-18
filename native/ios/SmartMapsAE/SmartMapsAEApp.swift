//  SmartMapsAEApp.swift
//  The app target. It imports SMCore and can reach exactly one type from it —
//  SMNavigationController — plus the value types that type returns. Every
//  engine, adapter and renderer is internal to SMCore and invisible here; the
//  compiler enforces it, not convention.

import SwiftUI
import SMCore

@main
struct SmartMapsAEApp: App {
    @StateObject private var sm = SMNavigationController()

    var body: some Scene {
        WindowGroup {
            SMRootView(sm: sm)
                .onAppear { sm.startNavigation() }
        }
    }
}
