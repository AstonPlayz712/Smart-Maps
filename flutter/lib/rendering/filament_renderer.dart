import '../models/route_filament.dart';
import '../models/mode_strand.dart';
import '../models/latlng.dart';

// ─── Enums ────────────────────────────────────────────────────────────────────

enum TipDirection { forward, backward }

// ─── FilamentSegment ──────────────────────────────────────────────────────────

/// A rendered slice of a [RouteFilament], coloured by travel mode.
class FilamentSegment {
  final List<LatLng> path;
  final TravelMode mode;
  final bool isActive;
  final double opacity;
  final int colour; // ARGB
  final double widthPixels;

  const FilamentSegment({
    required this.path,
    required this.mode,
    required this.isActive,
    this.opacity = 1.0,
    required this.colour,
    required this.widthPixels,
  });
}

// ─── FilamentRenderer ─────────────────────────────────────────────────────────

/// Renders route filaments tip-first, splitting them by travel mode into
/// colour-coded [FilamentSegment]s.
class FilamentRenderer {
  final List<FilamentSegment> _segments = [];
  int _tipIndex = 0;
  TipDirection _direction = TipDirection.forward;
  double _animationProgress = 0.0;

  // ─── Filament loading ────────────────────────────────────────────────────────

  void loadFilament(RouteFilament filament) {
    _segments
      ..clear()
      ..addAll(buildSegments(filament));
    _tipIndex = 0;
    _animationProgress = 0.0;
  }

  void clear() {
    _segments.clear();
    _tipIndex = 0;
    _animationProgress = 0.0;
  }

  // ─── Tip control ─────────────────────────────────────────────────────────────

  /// Advance the tip forward by [distanceMeters] along the path.
  void advanceTip(double distanceMeters) {
    double remaining = distanceMeters;
    while (remaining > 0 && _tipIndex < _segments.length - 1) {
      final seg = _segments[_tipIndex];
      final segLen = _segmentLength(seg.path);
      if (remaining >= segLen) {
        remaining -= segLen;
        _tipIndex++;
      } else {
        _animationProgress = remaining / segLen;
        break;
      }
    }
  }

  FilamentSegment? getTipSegment() {
    if (_segments.isEmpty) return null;
    final idx = _tipIndex.clamp(0, _segments.length - 1);
    return _segments[idx];
  }

  void setDirection(TipDirection dir) => _direction = dir;

  // ─── Visibility culling ───────────────────────────────────────────────────────

  List<FilamentSegment> getVisibleSegments(
    LatLng cameraCenter,
    double radiusMeters,
  ) {
    return _segments.where((seg) {
      return seg.path.any((p) => p.distanceTo(cameraCenter) <= radiusMeters);
    }).toList();
  }

  // ─── Segment building ─────────────────────────────────────────────────────────

  List<FilamentSegment> buildSegments(RouteFilament filament) {
    if (filament.strands.isEmpty) {
      // Fall back to full path as a single driving segment.
      return [
        FilamentSegment(
          path: filament.path,
          mode: TravelMode.drive,
          isActive: true,
          colour: _modeColour(TravelMode.drive),
          widthPixels: _modeWidth(TravelMode.drive),
        ),
      ];
    }

    return filament.strands.map((strand) {
      return FilamentSegment(
        path: strand.path.isNotEmpty ? strand.path : filament.path,
        mode: strand.mode,
        isActive: true,
        colour: _modeColour(strand.mode),
        widthPixels: _modeWidth(strand.mode),
        opacity: filament.isDegraded ? 0.6 : 1.0,
      );
    }).toList();
  }

  // ─── Mode → visual ───────────────────────────────────────────────────────────

  /// ARGB colour per travel mode.
  int _modeColour(TravelMode mode) {
    switch (mode) {
      case TravelMode.drive:
        return 0xFF1565C0; // Blue
      case TravelMode.transit:
        return 0xFF388E3C; // Green
      case TravelMode.walk:
        return 0xFF6D4C41; // Brown
      case TravelMode.cycle:
        return 0xFFE65100; // Deep Orange
      case TravelMode.microMobility:
        return 0xFF00ACC1; // Cyan
      case TravelMode.rideHail:
        return 0xFF7B1FA2; // Purple
      case TravelMode.ferry:
        return 0xFF0288D1; // Light Blue
      case TravelMode.indoor:
        return 0xFF546E7A; // Blue Grey
    }
  }

  /// Rendered width in pixels per travel mode.
  double _modeWidth(TravelMode mode) {
    switch (mode) {
      case TravelMode.drive:
        return 6.0;
      case TravelMode.transit:
        return 8.0;
      case TravelMode.walk:
        return 4.0;
      case TravelMode.cycle:
      case TravelMode.microMobility:
        return 5.0;
      case TravelMode.rideHail:
        return 6.0;
      case TravelMode.ferry:
        return 7.0;
      case TravelMode.indoor:
        return 4.0;
    }
  }

  double _segmentLength(List<LatLng> path) {
    double total = 0;
    for (int i = 0; i < path.length - 1; i++) {
      total += path[i].distanceTo(path[i + 1]);
    }
    return total;
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  List<FilamentSegment> get segments => List.unmodifiable(_segments);
  int get tipIndex => _tipIndex;
  double get animationProgress => _animationProgress;
  TipDirection get direction => _direction;
}
