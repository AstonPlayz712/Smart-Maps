// devshell/native/core/renderer.h
//
// Cross-platform C++ surface for the DevShell native sandbox. Both the
// Android JNI bridge (devshell/android/app/src/main/cpp/devshell_jni.cpp)
// and the iOS Swift renderer (devshell/ios/Sources/DevShellRenderer.swift,
// via a small Obj-C++ bridge of your choice) consume this header.
//
// Auto-class GPU pipelines will replace the body of renderer.cpp over
// time. The header surface is intentionally tiny to start — keeps the
// ABI stable while internals change.

#pragma once

#include <cstdint>
#include <string>

namespace devshell {

class Renderer {
public:
    Renderer() = default;
    ~Renderer() = default;

    Renderer(const Renderer&) = delete;
    Renderer& operator=(const Renderer&) = delete;

    /** Short identifier the JNI/Swift sides display to confirm wiring. */
    std::string greeting() const;

    /** Schema version of the renderer surface. Bump on ABI changes. */
    std::int32_t version() const;
};

}  // namespace devshell
