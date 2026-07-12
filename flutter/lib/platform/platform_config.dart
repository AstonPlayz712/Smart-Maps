import 'dart:io' show Platform;
import 'sm_maps_platform.dart';
import 'mobile/mobile_platform.dart';
import 'handheld/handheld_platform.dart';
import 'desktop/desktop_platform.dart';

/// Static platform detection helpers used throughout the engine.
///
/// All checks are computed once from [Platform] and cached for the process
/// lifetime.
abstract final class PlatformConfig {
  static final SmMapsPlatform _current = SmMapsPlatform.detect();

  /// The active [SmMapsPlatform] implementation for this run.
  static SmMapsPlatform get current => _current;

  /// True when running on iOS or Android.
  static bool get isMobile =>
      Platform.isAndroid || Platform.isIOS;

  /// True when running on Windows desktop (non-handheld) or macOS.
  static bool get isDesktop =>
      (Platform.isWindows &&
          !const bool.fromEnvironment('SM_HANDHELD', defaultValue: false)) ||
      Platform.isMacOS ||
      Platform.isLinux;

  /// True when running on a Windows handheld device.
  static bool get isHandheld =>
      Platform.isWindows &&
      const bool.fromEnvironment('SM_HANDHELD', defaultValue: false);

  /// True when the current platform is view-only.
  static bool get isViewOnly => _current.isViewOnly;

  /// True when active turn-by-turn navigation is available.
  static bool get supportsFullNavigation => !isViewOnly;

  /// Human-readable name for the current platform.
  static String get platformName => _current.platformName;

  /// Map of all feature flags as a plain [Map] (useful for analytics / logging).
  static Map<String, bool> get capabilities {
    final caps = _current.getCapabilities();
    return {
      for (final c in PlatformCapability.values) c.name: caps.contains(c),
    };
  }
}
