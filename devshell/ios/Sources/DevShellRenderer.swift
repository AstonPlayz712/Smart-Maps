import Foundation

/// Swift wrapper around the shared C++ renderer (`devshell::Renderer` in
/// `devshell/native/core/renderer.h`).
///
/// Calls go: Swift → `DevShellBridge` (Obj-C++) → C++. The bridge is a
/// tiny `.mm` file that imports the shared header — see
/// `DevShellBridge.h` / `DevShellBridge.mm`.
final class DevShellRenderer {

    private let bridge = DevShellBridge()

    func greeting() -> String {
        bridge.greeting()
    }

    func version() -> Int {
        Int(bridge.version())
    }

    func logFromNative(_ message: String) {
        bridge.log(message)
    }
}
