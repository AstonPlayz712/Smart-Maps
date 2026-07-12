import '../sm_maps_platform.dart';

/// Full navigation mode for Windows handheld devices.
///
/// Navigation, Sonic Engine, and Disruption Engine are all enabled.
/// Background location is disabled because the Windows app lifecycle does not
/// guarantee background execution.  Sensor support is partial — GNSS and basic
/// motion sensors are available but the barometer and magnetometer may be
/// absent on some hardware.
class HandheldPlatform implements SmMapsPlatform {
  @override
  bool get isViewOnly => false;

  @override
  String get platformName => 'handheld';

  @override
  bool get supportsBackground => false;

  @override
  Set<PlatformCapability> getCapabilities() => {
        PlatformCapability.navigation,
        PlatformCapability.immersiveNavigation,
        PlatformCapability.sonicEngine,
        PlatformCapability.disruptionEngine,
        PlatformCapability.passengerFlow,
        PlatformCapability.compliance,
        PlatformCapability.predictiveRouting,
        // allSensors excluded — partial sensor availability on Windows handheld
        // backgroundLocation excluded — Windows app lifecycle limitation
      };

  @override
  Future<void> initialize() async {
    // Windows-specific setup:
    // - Request location access via Windows.Devices.Geolocation (via FFI/platform channel)
    // - Initialise motion sensors where available
  }

  @override
  void dispose() {}
}
