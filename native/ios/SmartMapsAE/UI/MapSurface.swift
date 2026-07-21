// MapSurface.swift — the native map renderer (no SDK, no tiles, no WebView).
//
// Draws the offline road graph, active route, and snapped position from
// engine geometry on a SwiftUI Canvas. The mobile expression of the Zante
// renderer: engine-owned geometry drawn natively. Mirrors the Compose
// MapSurface exactly.

import SwiftUI

struct MapSurface: View {
    let graph: RoadGraph
    let route: Route?
    let position: GeoPoint?
    let headingDeg: Double
    let onRoad: Bool
    var metersPerScreen: Double = 900

    var body: some View {
        Canvas { context, size in
            guard let center = position ?? graph.edges.first?.path.first else { return }
            let scale = min(size.width, size.height) / metersPerScreen
            let cosLat = cos(center.lat * .pi / 180)

            func toScreen(_ p: GeoPoint) -> CGPoint {
                let dx = (p.lng - center.lng) * .pi / 180 * GeoPoint.earthRadiusM * cosLat
                let dy = (p.lat - center.lat) * .pi / 180 * GeoPoint.earthRadiusM
                return CGPoint(x: size.width / 2 + dx * scale, y: size.height / 2 - dy * scale)
            }

            // Road graph
            for edge in graph.edges where edge.path.count >= 2 {
                var path = Path()
                path.move(to: toScreen(edge.path[0]))
                for p in edge.path.dropFirst() { path.addLine(to: toScreen(p)) }
                context.stroke(
                    path,
                    with: .color(.primary.opacity(0.25)),
                    style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round)
                )
            }

            // Active route
            if let route, route.points.count >= 2 {
                var path = Path()
                path.move(to: toScreen(route.points[0]))
                for p in route.points.dropFirst() { path.addLine(to: toScreen(p)) }
                context.stroke(
                    path,
                    with: .color(.blue.opacity(0.9)),
                    style: StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round)
                )
            }

            // Snapped position: accuracy halo + heading-rotated arrow.
            if let position {
                let c = toScreen(position)
                let tint: Color = onRoad ? .blue : .orange
                context.fill(
                    Path(ellipseIn: CGRect(x: c.x - 23, y: c.y - 23, width: 46, height: 46)),
                    with: .color(tint.opacity(0.18))
                )
                var arrow = Path()
                arrow.move(to: CGPoint(x: 0, y: -13))
                arrow.addLine(to: CGPoint(x: -8, y: 9))
                arrow.addLine(to: CGPoint(x: 0, y: 4))
                arrow.addLine(to: CGPoint(x: 8, y: 9))
                arrow.closeSubpath()
                let transform = CGAffineTransform(translationX: c.x, y: c.y)
                    .rotated(by: headingDeg * .pi / 180)
                context.fill(arrow.applying(transform), with: .color(tint))
            }
        }
        .background(Color(.systemBackground))
    }
}
