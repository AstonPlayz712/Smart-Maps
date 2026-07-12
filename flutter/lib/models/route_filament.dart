import 'corridor.dart';
import 'disruption_node.dart';
import 'gate.dart';
import 'latlng.dart';
import 'mode_strand.dart';
import 'compliance_zone.dart';

enum FilamentType {
  primary,
  alternate,
  degraded,
  detour,
  scenic,
  transit,
  walking,
  cycling,
  multimodal,
}

class RouteFilament {
  RouteFilament({
    required this.id,
    required this.path,
    required this.type,
    this.distanceMeters = 0,
    this.durationSec = 0,
    this.strands = const <ModeStrand>[],
    DateTime? createdAt,
    this.label,
    this.disruptionNodes = const <DisruptionNode>[],
    this.corridors = const <Corridor>[],
    this.gates = const <Gate>[],
    this.complianceZones = const <ComplianceZone>[],
    this.frictionAbsorptionSec = 0,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final List<LatLng> path;
  final FilamentType type;
  final double distanceMeters;
  final double durationSec;
  final List<ModeStrand> strands;
  final DateTime createdAt;
  final String? label;
  final List<DisruptionNode> disruptionNodes;
  final List<Corridor> corridors;
  final List<Gate> gates;
  final List<ComplianceZone> complianceZones;
  final double frictionAbsorptionSec;

  LatLng? get origin => path.isEmpty ? null : path.first;
  LatLng? get destination => path.isEmpty ? null : path.last;
  List<ManeuverInstruction> get maneuvers =>
      strands.expand((strand) => strand.maneuvers).toList(growable: false);
  TravelMode get mode => strands.isEmpty ? TravelMode.walk : strands.first.mode;
  double get computedDistanceMeters {
    if (distanceMeters > 0) return distanceMeters;
    if (path.length < 2) return 0;
    var total = 0.0;
    for (var i = 1; i < path.length; i++) {
      total += path[i - 1].distanceTo(path[i]);
    }
    return total;
  }

  double effectiveDurationSec() => durationSec + frictionAbsorptionSec;

  RouteFilament copyWith({
    String? id,
    List<LatLng>? path,
    FilamentType? type,
    double? distanceMeters,
    double? durationSec,
    List<ModeStrand>? strands,
    Object? createdAt = _sentinel,
    Object? label = _sentinel,
    List<DisruptionNode>? disruptionNodes,
    List<Corridor>? corridors,
    List<Gate>? gates,
    List<ComplianceZone>? complianceZones,
    double? frictionAbsorptionSec,
  }) {
    return RouteFilament(
      id: id ?? this.id,
      path: path ?? this.path,
      type: type ?? this.type,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      durationSec: durationSec ?? this.durationSec,
      strands: strands ?? this.strands,
      createdAt: identical(createdAt, _sentinel)
          ? this.createdAt
          : createdAt as DateTime?,
      label: identical(label, _sentinel) ? this.label : label as String?,
      disruptionNodes: disruptionNodes ?? this.disruptionNodes,
      corridors: corridors ?? this.corridors,
      gates: gates ?? this.gates,
      complianceZones: complianceZones ?? this.complianceZones,
      frictionAbsorptionSec:
          frictionAbsorptionSec ?? this.frictionAbsorptionSec,
    );
  }
}

const Object _sentinel = Object();
