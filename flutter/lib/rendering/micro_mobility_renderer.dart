import '../models/compliance_zone.dart';
import '../models/latlng.dart';
import '../models/mode_strand.dart';

// ─── Enums ────────────────────────────────────────────────────────────────────

enum ZoneRenderType { noRide, slowZone, legalBay, geofence }

// ─── MicroMobilityZoneOverlay ─────────────────────────────────────────────────

/// A rendered compliance zone overlay for micro-mobility.
class MicroMobilityZoneOverlay {
  final ComplianceZone zone;
  final ZoneRenderType renderType;
  final int fillColour; // ARGB
  final int strokeColour; // ARGB
  final double strokeWidth;
  final double fillOpacity;
  final String? label;

  const MicroMobilityZoneOverlay({
    required this.zone,
    required this.renderType,
    required this.fillColour,
    required this.strokeColour,
    required this.strokeWidth,
    required this.fillOpacity,
    this.label,
  });
}

// ─── MicroMobilityRenderer ───────────────────────────────────────────────────

/// Renders micro-mobility compliance zones (no-ride, slow, legal bays,
/// geofences) as polygon overlays.
class MicroMobilityRenderer {
  final Map<String, MicroMobilityZoneOverlay> _overlays = {};

  // ─── Zone management ─────────────────────────────────────────────────────────

  /// Load and filter zones relevant to micro-mobility rendering.
  void loadZones(List<ComplianceZone> zones) {
    _overlays.clear();
    for (final zone in zones) {
      if (_isRelevant(zone)) {
        _overlays[zone.id] = _buildOverlay(zone);
      }
    }
  }

  void addZone(ComplianceZone zone) {
    if (_isRelevant(zone)) {
      _overlays[zone.id] = _buildOverlay(zone);
    }
  }

  void removeZone(String id) => _overlays.remove(id);

  void clearAll() => _overlays.clear();

  List<MicroMobilityZoneOverlay> get activeOverlays =>
      _overlays.values.toList();

  // ─── Overlay construction ────────────────────────────────────────────────────

  MicroMobilityZoneOverlay _buildOverlay(ComplianceZone zone) {
    final renderType = _renderType(zone.type);
    return MicroMobilityZoneOverlay(
      zone: zone,
      renderType: renderType,
      fillColour: _zoneColour(renderType),
      strokeColour: _strokeColour(renderType),
      strokeWidth: _strokeWidth(renderType),
      fillOpacity: _zoneOpacity(renderType),
      label: zone.name.isNotEmpty ? zone.name : null,
    );
  }

  // ─── Type mapping ─────────────────────────────────────────────────────────────

  ZoneRenderType _renderType(ComplianceZoneType type) {
    switch (type) {
      case ComplianceZoneType.noRideZone:
        return ZoneRenderType.noRide;
      case ComplianceZoneType.slowZone:
      case ComplianceZoneType.autoLimitSpeed:
        return ZoneRenderType.slowZone;
      case ComplianceZoneType.legalBay:
        return ZoneRenderType.legalBay;
      case ComplianceZoneType.microMobilityGeofence:
      case ComplianceZoneType.lez:
      case ComplianceZoneType.congestionCharge:
        return ZoneRenderType.geofence;
    }
  }

  bool _isRelevant(ComplianceZone zone) {
    return zone.type == ComplianceZoneType.noRideZone ||
        zone.type == ComplianceZoneType.slowZone ||
        zone.type == ComplianceZoneType.legalBay ||
        zone.type == ComplianceZoneType.microMobilityGeofence ||
        zone.type == ComplianceZoneType.autoLimitSpeed ||
        (zone.applicableModes.contains(TravelMode.microMobility) ||
            zone.applicableModes.contains(TravelMode.cycle));
  }

  // ─── Visual mapping ──────────────────────────────────────────────────────────

  /// Fill colour (ARGB) per render type.
  int _zoneColour(ZoneRenderType type) {
    switch (type) {
      case ZoneRenderType.noRide:
        return 0x40F44336; // Red (semi-transparent)
      case ZoneRenderType.slowZone:
        return 0x40FF9800; // Orange (semi-transparent)
      case ZoneRenderType.legalBay:
        return 0x4043A047; // Green (semi-transparent)
      case ZoneRenderType.geofence:
        return 0x401565C0; // Blue (semi-transparent)
    }
  }

  /// Stroke colour (ARGB) per render type.
  int _strokeColour(ZoneRenderType type) {
    switch (type) {
      case ZoneRenderType.noRide:
        return 0xFFF44336;
      case ZoneRenderType.slowZone:
        return 0xFFFF9800;
      case ZoneRenderType.legalBay:
        return 0xFF43A047;
      case ZoneRenderType.geofence:
        return 0xFF1565C0;
    }
  }

  double _strokeWidth(ZoneRenderType type) {
    switch (type) {
      case ZoneRenderType.noRide:
        return 2.5;
      case ZoneRenderType.slowZone:
        return 2.0;
      case ZoneRenderType.legalBay:
        return 1.5;
      case ZoneRenderType.geofence:
        return 2.0;
    }
  }

  double _zoneOpacity(ZoneRenderType type) {
    switch (type) {
      case ZoneRenderType.noRide:
        return 0.35;
      case ZoneRenderType.slowZone:
        return 0.25;
      case ZoneRenderType.legalBay:
        return 0.30;
      case ZoneRenderType.geofence:
        return 0.20;
    }
  }
}
