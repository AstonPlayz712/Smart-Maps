import '../sm_maps_platform.dart';

/// Full-featured platform for iOS and Android.
///
/// All Smart Maps capabilities are enabled, including background location and
/// the full sensor suite (GNSS, accelerometer, gyroscope, magnetometer,
/// barometer).
class MobilePlatform implements SmMapsPlatform {
  @override
  bool get isViewOnly => false;

  @override
  String get platformName => 'mobile';

  @override
  bool get supportsBackground => true;

  @override
  Set<PlatformCapability> getCapabilities() => {
        PlatformCapability.navigation,
        PlatformCapability.immersiveNavigation,
        PlatformCapability.sonicEngine,
        PlatformCapability.disruptionEngine,
        PlatformCapability.passengerFlow,
        PlatformCapability.compliance,
        PlatformCapability.predictiveRouting,
        PlatformCapability.allSensors,
        PlatformCapability.backgroundLocation,
      };

  @override
  Future<void> initialize() async {
    // Mobile-specific setup:
    // - Request location permissions (via permission_handler)
    // - Configure background location task
    // - Register sensor streams
    // These are wired at the service layer; platform just declares readiness.
  }

  @override
  void dispose() {
    // Cancel background location task if active.
  }
}
