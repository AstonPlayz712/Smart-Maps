#!/bin/sh
#
# Appflow compatibility shim.
#
# This is a Capacitor project. Appflow's Android pipeline (when it
# misclassifies us as Cordova) probes for ./gradlew at the repo root,
# never `cd`s into android/, and skips the Capacitor sync step that
# generates these files Gradle needs:
#
#   android/capacitor-cordova-android-plugins/cordova.variables.gradle
#   android/app/src/main/assets/capacitor.config.json
#   android/app/src/main/assets/public/        (the Vite bundle)
#
# This shim makes the build self-contained — it runs `npm run build` +
# `npx cap sync android` when those artefacts are missing, then delegates
# to the real Gradle wrapper under android/. Idempotent: when Appflow
# (or a local dev) has already done those steps, the checks skip.

set -e

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$DIR"

# 1. node_modules — Appflow's dependency_install runs this, but defend
#    against a cold environment.
if [ ! -d "node_modules" ]; then
  echo "[gradlew shim] node_modules missing — running npm ci"
  if [ -f "package-lock.json" ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

# 2. Web bundle (dist/). cap sync copies this into the APK assets.
if [ ! -f "dist/index.html" ]; then
  echo "[gradlew shim] no dist/index.html — running npm run build"
  npm run build
fi

# 3. Capacitor sync — generates the Cordova-plugins shim project and
#    copies dist/ + capacitor.config.json into the Android assets.
if [ ! -f "android/capacitor-cordova-android-plugins/cordova.variables.gradle" ] \
|| [ ! -f "android/app/src/main/assets/capacitor.config.json" ]; then
  echo "[gradlew shim] missing cap sync artefacts — running npx cap sync android"
  npx cap sync android
fi

# 4. Hand off to the real wrapper.
if [ ! -x "$DIR/android/gradlew" ]; then
  echo "error: $DIR/android/gradlew not found or not executable" >&2
  exit 1
fi

cd "$DIR/android"
exec ./gradlew "$@"
