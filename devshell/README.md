# Smart Maps DevShell

A native sandbox app that lives next to the main Smart Maps proto but runs **completely independently**.

## What it is

A separate Android + iOS shell where Auto-class native work happens — GPU rendering, native camera, native tile pipeline, native IN, custom plugins — without Capacitor, without Appflow, and without risking the proto.

The main Smart Maps app stays the way it is (Capacitor + Appflow + Boot Stability Layer). DevShell is the freedom environment.

## What it is *not*

- **Not the main app.** Different package id (`com.smartmaps.devshell`), different icon, different lifecycle.
- **Not Capacitor.** No WebView, no `cap sync`, no `capacitor.config.ts`.
- **Not on Appflow.** Builds run on the GitHub Actions pipeline at `.github/workflows/android-builds.yml`, or locally via Xcode for iOS.
- **Not shipping to users.** Internal builds only.
- **Not subject to the proto's Boot Stability Layer / SM proto modules / LG UI.** DevShell can break and rebuild freely; the proto is unaffected.

## Directory layout

```
devshell/
├── README.md                  ← you are here
├── android/                   ← Android Gradle project (Kotlin + JNI + C++)
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   ├── gradle/wrapper/        ← Gradle 8.2.1 wrapper
│   ├── gradlew, gradlew.bat
│   └── app/
│       ├── build.gradle       ← namespace com.smartmaps.devshell, minSdk 26
│       ├── CMakeLists.txt     ← compiles the native sandbox lib
│       ├── proguard-rules.pro
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── cpp/           ← JNI entry points
│           ├── java/com/smartmaps/devshell/
│           │   ├── MainActivity.kt
│           │   └── NativeBridge.kt
│           └── res/           ← minimal flat UI
├── ios/                       ← Xcode-managed (manual setup, see ios/README.md)
│   ├── README.md
│   ├── Sources/               ← Swift source templates to drop into a new Xcode project
│   └── Info.plist.template
├── src/                       ← future shared TS (currently empty placeholder)
└── native/                    ← cross-platform native C++ shared between Android + iOS
    └── core/
        ├── renderer.h
        └── renderer.cpp
```

## How to build

### Android (cloud)

Every push that touches `devshell/` or runs `.github/workflows/android-builds.yml` manually produces a DevShell debug APK as a workflow artifact. Download from the Actions run summary.

```yaml
# .github/workflows/android-builds.yml has a `devshell` job that runs:
cd devshell/android
./gradlew assembleDebug
```

### Android (local — optional)

```bash
cd devshell/android
./gradlew assembleDebug
# APK at app/build/outputs/apk/debug/app-debug.apk
```

Requirements: JDK 17, Android SDK with platform 34 + build-tools 34, NDK 25.2.9519653, CMake 3.22.1. The cloud pipeline pre-installs all of this.

### iOS (manual via Xcode)

See `ios/README.md`. The iOS scaffold ships as Swift source templates so you can create a fresh Xcode project, drag the files in, and have something that builds for the iPhone 11 without a half-broken `project.pbxproj` in git.

## What's already wired up

- **Android Kotlin app** that loads on launch, instantiates `NativeBridge`, calls into C++ via JNI, and renders the returned greeting string. Proves the Kotlin ↔ JNI ↔ C++ round-trip end-to-end.
- **Shared C++ renderer skeleton** under `native/core/` consumed by both the Android Gradle build (via `CMakeLists.txt`) and (eventually) the iOS Xcode project.
- **Theme**: matches the proto's brand palette (`#070b14` / `#00e5ff`) so DevShell visually identifies as part of Smart Maps OS while being its own binary.

## Roadmap

1. **Phase 1 (now)** — Round-trip native string. Done.
2. **Phase 2** — `GLSurfaceView` + GLES3 hello-triangle from C++. The CMake stack already links `EGL` + `GLESv3`.
3. **Phase 3** — Vulkan or Metal renderer, port `native/core/renderer.cpp` to draw tiled geometry.
4. **Phase 4** — Wire to AutoTiles native tile pipeline.
5. **Phase 5** — Eventually replace the main Smart Maps proto's Capacitor WebView with the DevShell-developed native shell once it's stable.
