# devshell/native/

Cross-platform C++ shared between the DevShell Android Gradle build and the iOS Xcode build. Anything that compiles on both lives here so the renderer body stays platform-agnostic.

```
native/
└── core/
    ├── renderer.h    ← ABI consumed by Android JNI + iOS Swift bridge
    └── renderer.cpp  ← implementation (currently a stub)
```

**Android** builds it via `devshell/android/app/CMakeLists.txt` (CMake picks `core/renderer.cpp` directly).

**iOS** consumes it by adding `devshell/native/core/` to the Xcode project's "Header Search Paths" and the source file to a static library target — see `devshell/ios/README.md` for setup.

Keep the public surface in `renderer.h` minimal and stable; rewrite the internals freely.
