import 'dart:io' show Platform;
import 'mobile/mobile_platform.dart';
import 'handheld/handheld_platform.dart';
import 'desktop/desktop_platform.dart';

// ─── Platform capabilities ────────────────────────────────────────────────────

/// Feature flags indicating which Smart Maps capabilities are available on the
/// current platform.
enum PlatformCapability {
  navigation,
  immersiveNavigation,
  sonicEngine,
  disruptionEngine,
  passengerFlow,
  compliance,
  predictiveRouting,
  allSensors,
  backgroundLocation,
}

// ─── Abstract platform interface ──────────────────────────────────────────────

/// Platform contract.  Each platform implementation (mobile / handheld /
/// desktop) implements this interface so the rest of the codebase can remain
/// platform-agnostic.
abstract class SmMapsPlatform {
  /// True when the platform is view-only (no active navigation).
  bool get isViewOnly;

  /// Human-readable platform identifier.
  String get platformName;

  /// True when background location is supported.
  bool get supportsBackground;

  /// Set of enabled capabilities for this platform.
  Set<PlatformCapability> getCapabilities();

  /// Called once on engine start.
  Future<void> initialize();

  /// Release platform-level resources.
  void dispose();

  // ─── Factory ────────────────────────────────────────────────────────────────

  /// Detect the current platform and return the appropriate implementation.
  ///
  /// Override detection can be injected via the [_override] field (useful for
  /// testing).
  static SmMapsPlatform? _override;

  static void setOverride(SmMapsPlatform platform) => _override = platform;

  static void clearOverride() => _override = null;

  static SmMapsPlatform detect() {
    if (_override != null) return _override!;

    if (Platform.isAndroid || Platform.isIOS) {
      return MobilePlatform();
    }

    if (Platform.isWindows) {
      // Handheld Windows devices expose a specific env variable in our build
      // pipeline; fall back to desktop (view-only) otherwise.
      const isHandheld = bool.fromEnvironment('SM_HANDHELD', defaultValue: false);
      return isHandheld ? HandheldPlatform() : DesktopPlatform();
    }

    if (Platform.isMacOS || Platform.isLinux) {
      return DesktopPlatform();
    }

    // Web / unknown — default to desktop (view-only)
    return DesktopPlatform();
  }
}
