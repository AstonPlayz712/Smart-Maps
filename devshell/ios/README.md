# DevShell iOS

The iOS side of DevShell is **Xcode-managed** — there's no Capacitor, no CocoaPods, no `cap sync`. You open Xcode on a Mac, create a fresh iOS App project, drag the Swift sources from `devshell/ios/Sources/` into it, point Header Search Paths at `devshell/native/core/`, build, run.

We intentionally don't commit a half-broken `project.pbxproj` to git — those files are touchy enough that the only safe way to ship one is to generate it inside Xcode locally. So this folder ships **templates** that produce a clean project when combined with a vanilla "iOS App (Swift)" Xcode template.

## One-time Xcode setup (when you have a Mac in front of you)

1. **File → New → Project → iOS → App**.
2. Product Name: `DevShell` · Organization Identifier: `com.smartmaps` · Interface: `Storyboard` · Language: `Swift` · turn off Core Data / tests.
3. Save somewhere outside the Smart Maps repo, then close Xcode.
4. **Replace the generated source files** with the ones from `devshell/ios/Sources/`:
   - `AppDelegate.swift`
   - `SceneDelegate.swift`
   - `ViewController.swift`
   - `DevShellRenderer.swift`
   - `DevShellBridge.h`
   - `DevShellBridge.mm`
5. **Replace `Info.plist`** content with `Info.plist.template`.
6. In **Project → Build Settings**:
   - **Header Search Paths**: add `$(SRCROOT)/../../native/core` (path is relative to the Xcode project; adjust if you put the project elsewhere).
   - **User Header Search Paths**: same path, recursive.
   - **C++ Language Dialect**: `GNU++17`.
   - **C++ Standard Library**: `libc++`.
7. **Add to the target's "Compile Sources"**: `devshell/native/core/renderer.cpp` (drag it in as a folder reference or a single file; either works).
8. Build for "Any iOS Device" or your iPhone 11 with a development signing cert.

## What the templates do

- `AppDelegate.swift` — standard `UIApplicationDelegate`, hands off to the scene.
- `SceneDelegate.swift` — minimal scene wiring; sets the root view controller to `ViewController`.
- `ViewController.swift` — full-screen dark view with the brand mark + a label populated by `DevShellRenderer.greeting()` (round-trip from Swift → Obj-C++ → shared C++).
- `DevShellRenderer.swift` — thin Swift wrapper. Calls into the Obj-C++ bridge.
- `DevShellBridge.h` + `.mm` — Obj-C++ shim that imports `renderer.h` from `devshell/native/core/` and exposes a Swift-friendly surface. The `.mm` extension lets the file mix C++ with Objective-C runtime.
- `Info.plist.template` — bundle id `com.smartmaps.devshell`, dark status bar, portrait + landscape, no background modes.

## What you get on first run

A dark Smart Maps-themed screen with:

- The brand mark
- "DevShell · iOS sandbox" subtitle
- Text from C++: "DevShell native renderer alive"
- Footer: "renderer v1"

If you see that string, the Swift ↔ Obj-C++ ↔ shared C++ bridge is working and you can start adding Metal / MTKView / native tile experiments on top.

## Cloud builds?

No. iOS DevShell is intentionally manual-only — Apple's signing + provisioning workflow is fiddly enough that mixing it with cloud CI for a sandbox app isn't worth the maintenance overhead yet. The Android side runs in the cloud pipeline; iOS waits until you're in front of Xcode.

When that changes, **Xcode Cloud** is the canonical answer (Apple-hosted, integrates with Xcode signing). Add a workflow there and it'll happily build this project once you commit the `.xcodeproj` from your local Xcode setup.
