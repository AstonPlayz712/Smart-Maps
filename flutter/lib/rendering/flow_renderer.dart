import '../models/flow_ribbon.dart';
import '../models/latlng.dart';

// ─── FlowRenderCell ───────────────────────────────────────────────────────────

/// A single rendered cell of a [FlowRibbon].
class FlowRenderCell {
  final List<LatLng> path;
  final CrowdingLevel crowdingLevel;
  final int colour; // ARGB
  final double widthScale;
  final double opacity;

  const FlowRenderCell({
    required this.path,
    required this.crowdingLevel,
    required this.colour,
    required this.widthScale,
    required this.opacity,
  });
}

// ─── FlowRenderer ─────────────────────────────────────────────────────────────

/// Renders passenger flow ribbons with crowding-scaled visual weight.
///
/// Each [FlowRibbon] is converted to a list of [FlowRenderCell]s, one per
/// [FlowCell].  Cell width and colour encode the crowding level so dense
/// sections are visually prominent.
class FlowRenderer {
  final Map<String, List<FlowRenderCell>> _ribbons = {};

  // ─── Ribbon management ───────────────────────────────────────────────────────

  void loadRibbon(FlowRibbon ribbon) {
    _ribbons[ribbon.id] = _buildCells(ribbon);
  }

  void updateRibbon(FlowRibbon ribbon) => loadRibbon(ribbon);

  void removeRibbon(String id) => _ribbons.remove(id);

  void clearAll() => _ribbons.clear();

  // ─── Accessors ───────────────────────────────────────────────────────────────

  List<FlowRenderCell> getRenderCells(String ribbonId) =>
      _ribbons[ribbonId] ?? [];

  List<FlowRenderCell> getAllCells() =>
      _ribbons.values.expand((cells) => cells).toList();

  // ─── Cell construction ───────────────────────────────────────────────────────

  List<FlowRenderCell> _buildCells(FlowRibbon ribbon) {
    return ribbon.cells.map((cell) {
      // Compute the path slice for this cell.
      final segPath = _segmentPath(ribbon.path, cell.segmentIndex);
      return FlowRenderCell(
        path: segPath,
        crowdingLevel: cell.crowdingLevel,
        colour: _crowdingColour(cell.crowdingLevel),
        widthScale: _crowdingWidth(cell.crowdingLevel),
        opacity: _crowdingOpacity(cell.crowdingLevel),
      );
    }).toList();
  }

  /// Returns the path segment for the given [segmentIndex].
  ///
  /// If the index is in-range, returns [path[i], path[i+1]]; otherwise
  /// returns the full path as a fallback.
  List<LatLng> _segmentPath(List<LatLng> path, int segmentIndex) {
    if (path.length < 2) return path;
    final i = segmentIndex.clamp(0, path.length - 2);
    return [path[i], path[i + 1]];
  }

  // ─── Crowding → visual ───────────────────────────────────────────────────────

  /// ARGB colour per crowding level (green → red scale).
  int _crowdingColour(CrowdingLevel level) {
    switch (level) {
      case CrowdingLevel.empty:
        return 0xFF43A047; // Green
      case CrowdingLevel.low:
        return 0xFF7CB342; // Light Green
      case CrowdingLevel.medium:
        return 0xFFFBC02D; // Amber
      case CrowdingLevel.high:
        return 0xFFF57C00; // Deep Orange
      case CrowdingLevel.crush:
        return 0xFFD32F2F; // Red
    }
  }

  /// Width scale 1.0–3.0 per crowding level.
  double _crowdingWidth(CrowdingLevel level) {
    switch (level) {
      case CrowdingLevel.empty:
        return 1.0;
      case CrowdingLevel.low:
        return 1.5;
      case CrowdingLevel.medium:
        return 2.0;
      case CrowdingLevel.high:
        return 2.5;
      case CrowdingLevel.crush:
        return 3.0;
    }
  }

  /// Opacity 0.5–1.0 per crowding level.
  double _crowdingOpacity(CrowdingLevel level) {
    switch (level) {
      case CrowdingLevel.empty:
        return 0.5;
      case CrowdingLevel.low:
        return 0.65;
      case CrowdingLevel.medium:
        return 0.8;
      case CrowdingLevel.high:
        return 0.9;
      case CrowdingLevel.crush:
        return 1.0;
    }
  }
}
