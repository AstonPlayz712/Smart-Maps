import Capacitor
import UIKit

//
// CapacitorBridge.swift
//
// Documentation file for the Capacitor wiring. The actual bridge class is
// `CAPBridgeViewController` from the Capacitor pod — it is wired up via:
//
//   1. Main.storyboard's initial view controller is set to `ViewController`,
//      which subclasses `CAPBridgeViewController`.
//   2. The Capacitor pod is added via `ios/App/Podfile` from the
//      `@capacitor/ios` npm package.
//   3. Runtime config (appId, server, …) is read from `capacitor.config.json`,
//      which `npx cap sync ios` copies into `ios/App/App/`.
//
// Use this file to hook into the bridge — register custom plugins, observe
// lifecycle events, or extend `CAPBridgeViewController` — without polluting
// `ViewController.swift`.
//

extension CAPBridgeViewController {
    // Reserved for future bridge customization.
}
