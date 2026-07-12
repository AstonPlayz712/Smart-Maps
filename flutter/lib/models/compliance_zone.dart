import 'latlng.dart';
import 'mode_strand.dart';

enum ComplianceZoneType { lez, slowZone, noRideZone, autoLimitSpeed, legalBay, microMobilityGeofence, congestionCharge }

enum EnforcementLevel { advisory, monitored, enforced, automatic }

class TimeRange {
  const TimeRange({
    required this.startHour,
    this.startMinute = 0,
    required this.endHour,
    this.endMinute = 0,
  });

  final int startHour;
  final int startMinute;
  final int endHour;
  final int endMinute;

  bool contains(DateTime time) {
    final minute = time.hour * 60 + time.minute;
    final start = startHour * 60 + startMinute;
    final end = endHour * 60 + endMinute;
    if (start <= end) {
      return minute >= start && minute <= end;
    }
    return minute >= start || minute <= end;
  }
}

class ComplianceZone {
  const ComplianceZone({
    required this.id,
    required this.polygon,
    this.speedLimitMps,
    this.name,
    this.type = ComplianceZoneType.slowZone,
    this.enforcementLevel = EnforcementLevel.enforced,
    this.applicableModes = const <TravelMode>[],
    this.activeTimeRanges = const <TimeRange>[],
  });

  final String id;
  final String? name;
  final List<LatLng> polygon;
  final double? speedLimitMps;
  final ComplianceZoneType type;
  final EnforcementLevel enforcementLevel;
  final List<TravelMode> applicableModes;
  final List<TimeRange> activeTimeRanges;

  bool appliesToMode(TravelMode mode) {
    return applicableModes.isEmpty || applicableModes.contains(mode);
  }

  bool isActiveAt(DateTime time) {
    return activeTimeRanges.isEmpty || activeTimeRanges.any((range) => range.contains(time));
  }

  ComplianceZone copyWith({
    String? id,
    String? name,
    List<LatLng>? polygon,
    Object? speedLimitMps = _sentinel,
    ComplianceZoneType? type,
    EnforcementLevel? enforcementLevel,
    List<TravelMode>? applicableModes,
    List<TimeRange>? activeTimeRanges,
  }) {
    return ComplianceZone(
      id: id ?? this.id,
      name: name ?? this.name,
      polygon: polygon ?? this.polygon,
      speedLimitMps: identical(speedLimitMps, _sentinel)
          ? this.speedLimitMps
          : speedLimitMps as double?,
      type: type ?? this.type,
      enforcementLevel: enforcementLevel ?? this.enforcementLevel,
      applicableModes: applicableModes ?? this.applicableModes,
      activeTimeRanges: activeTimeRanges ?? this.activeTimeRanges,
    );
  }
}

const Object _sentinel = Object();
