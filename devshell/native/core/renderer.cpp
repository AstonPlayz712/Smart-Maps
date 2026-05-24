// devshell/native/core/renderer.cpp
//
// Skeleton implementation. Real Auto-class work happens here: GLES3 /
// Vulkan / Metal context bring-up, tile decoder, camera matrix math.
// Today it's a placeholder so the JNI / Swift round-trip is provable.

#include "renderer.h"

namespace devshell {

std::string Renderer::greeting() const {
    return "DevShell native renderer alive";
}

std::int32_t Renderer::version() const {
    return 1;
}

}  // namespace devshell
