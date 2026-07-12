import '../sm_maps_platform.dart';

/// View-only platform for Windows desktop and macOS.
///
/// Navigation, Sonic Engine, and real-time sensors are disabled.  The user
/// can explore the map, view saved places, and view transit information, but
/// cannot start active turn-by-turn navigation.
class DesktopPlatform implements SmMapsPlatform {
  @override
  bool get isViewOnly => true;

  @override
  String get platformName => 'desktop';

  @override
  bool get supportsBackground => false;

  @override
  Set<PlatformCapability> getCapabilities() => {
        // Desktop supports Explore, Saved, Transit viewing, and Compliance
        // display only.  Active navigation capabilities are deliberately
        // excluded.
        PlatformCapability.passengerFlow,
        PlatformCapability.compliance,
        PlatformCapability.predictiveRouting,
      };

  @override
  Future<void> initialize() async {
    // Desktop-specific setup:
    // - No location permissions required
    // - Map rendered in view-only mode
    // - No sensor streams
  }

  @override
  void dispose() {}
}
