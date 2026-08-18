// OfflineGeometryCache.swift — A/E Offline Geometry Cache.
//
// Road graphs persist as Codable JSON in the app's Application Support
// directory. The cache is the only geometry source the engines see — online
// refresh (when it exists) writes through it. Connectivity-agnostic by
// construction. Mirrors the Kotlin cache.

import Foundation

final class OfflineGeometryCache {

    private let dir: URL

    init(directory: URL? = nil) {
        if let directory {
            dir = directory
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            dir = base.appendingPathComponent("geometry", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    func save(key: String, graph: RoadGraph) {
        guard let data = try? JSONEncoder().encode(graph) else { return }
        try? data.write(to: fileFor(key), options: .atomic)
    }

    func load(key: String) -> RoadGraph? {
        guard let data = try? Data(contentsOf: fileFor(key)) else { return nil }
        return try? JSONDecoder().decode(RoadGraph.self, from: data)
    }

    func has(key: String) -> Bool {
        FileManager.default.fileExists(atPath: fileFor(key).path)
    }

    func delete(key: String) {
        try? FileManager.default.removeItem(at: fileFor(key))
    }

    func keys() -> [String] {
        let contents = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return contents.filter { $0.pathExtension == "json" }.map { $0.deletingPathExtension().lastPathComponent }
    }

    func sizeBytes() -> Int64 {
        let contents = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return contents.reduce(0) { sum, url in
            sum + Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    private func fileFor(_ key: String) -> URL {
        let safe = key.replacingOccurrences(of: "[^a-zA-Z0-9._-]", with: "_", options: .regularExpression)
        return dir.appendingPathComponent("\(safe).json")
    }
}
