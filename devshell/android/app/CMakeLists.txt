cmake_minimum_required(VERSION 3.22.1)
project(devshell_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Cross-platform native code shared with iOS lives under devshell/native/core.
set(SHARED_NATIVE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../native/core)

add_library(devshell_native SHARED
    src/main/cpp/devshell_jni.cpp
    ${SHARED_NATIVE_DIR}/renderer.cpp
)

target_include_directories(devshell_native PRIVATE
    src/main/cpp
    ${SHARED_NATIVE_DIR}
)

find_library(log-lib log)
find_library(android-lib android)
find_library(egl-lib EGL)
find_library(glesv3-lib GLESv3)

target_link_libraries(devshell_native
    ${log-lib}
    ${android-lib}
    ${egl-lib}
    ${glesv3-lib}
)
