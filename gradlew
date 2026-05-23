#!/bin/sh
#
# Appflow compatibility shim.
#
# This is a Capacitor project, so the real Gradle wrapper lives under
# `android/`. Appflow's Android build pipeline (when it can't decide
# between Cordova and Capacitor) probes for `./gradlew` at the repo root.
# This shim makes that probe pass and forwards every argument to the real
# wrapper while running it from the Android project directory.
#
# Anywhere else (local dev, CI), just call `android/gradlew` directly.

set -e

# Resolve our own directory robustly (works whether invoked by relative
# path, absolute path, or via a symlink).
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if [ ! -x "$DIR/android/gradlew" ]; then
  echo "error: $DIR/android/gradlew not found or not executable" >&2
  exit 1
fi

cd "$DIR/android"
exec ./gradlew "$@"
