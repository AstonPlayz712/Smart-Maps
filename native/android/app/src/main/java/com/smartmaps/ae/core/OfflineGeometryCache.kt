package com.smartmaps.ae.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * A/E Offline Geometry Cache — local road-graph storage.
 *
 * Road graphs persist as JSON tiles in app-private storage so snapping,
 * routing and dead reckoning run with zero connectivity. The cache is the
 * *only* geometry source the engines see — online refresh (when it exists)
 * writes through this cache; the engines never notice where bytes came from.
 * That is the connectivity-agnostic contract.
 */
class OfflineGeometryCache(private val dir: File) {

    init {
        dir.mkdirs()
    }

    fun save(key: String, graph: RoadGraph) {
        val json = JSONObject().apply {
            put("nodes", JSONArray().apply {
                graph.nodes.values.forEach { node ->
                    put(JSONObject().apply {
                        put("id", node.id)
                        put("lat", node.point.lat)
                        put("lng", node.point.lng)
                    })
                }
            })
            put("edges", JSONArray().apply {
                graph.edges.forEach { edge ->
                    put(JSONObject().apply {
                        put("id", edge.id)
                        put("from", edge.fromNodeId)
                        put("to", edge.toNodeId)
                        put("lengthM", edge.lengthM)
                        edge.name?.let { put("name", it) }
                        put("speedLimitMps", edge.speedLimitMps)
                        put("oneWay", edge.oneWay)
                        put("path", JSONArray().apply {
                            edge.path.forEach { p ->
                                put(JSONArray().apply { put(p.lat); put(p.lng) })
                            }
                        })
                    })
                }
            })
        }
        fileFor(key).writeText(json.toString())
    }

    fun load(key: String): RoadGraph? {
        val file = fileFor(key)
        if (!file.exists()) return null
        return runCatching {
            val json = JSONObject(file.readText())
            val nodes = mutableMapOf<String, RoadNode>()
            val nodesArr = json.getJSONArray("nodes")
            for (i in 0 until nodesArr.length()) {
                val n = nodesArr.getJSONObject(i)
                val node = RoadNode(n.getString("id"), GeoPoint(n.getDouble("lat"), n.getDouble("lng")))
                nodes[node.id] = node
            }
            val edges = mutableListOf<RoadEdge>()
            val edgesArr = json.getJSONArray("edges")
            for (i in 0 until edgesArr.length()) {
                val e = edgesArr.getJSONObject(i)
                val pathArr = e.getJSONArray("path")
                val path = mutableListOf<GeoPoint>()
                for (j in 0 until pathArr.length()) {
                    val p = pathArr.getJSONArray(j)
                    path.add(GeoPoint(p.getDouble(0), p.getDouble(1)))
                }
                edges.add(
                    RoadEdge(
                        id = e.getString("id"),
                        fromNodeId = e.getString("from"),
                        toNodeId = e.getString("to"),
                        path = path,
                        lengthM = e.getDouble("lengthM"),
                        name = if (e.has("name")) e.getString("name") else null,
                        speedLimitMps = e.optDouble("speedLimitMps", 13.4),
                        oneWay = e.optBoolean("oneWay", false)
                    )
                )
            }
            RoadGraph(nodes, edges)
        }.getOrNull()
    }

    fun has(key: String): Boolean = fileFor(key).exists()

    fun delete(key: String) {
        fileFor(key).delete()
    }

    fun keys(): List<String> =
        dir.listFiles()?.filter { it.extension == "json" }?.map { it.nameWithoutExtension } ?: emptyList()

    fun sizeBytes(): Long = dir.listFiles()?.sumOf { it.length() } ?: 0L

    private fun fileFor(key: String): File {
        val safe = key.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return File(dir, "$safe.json")
    }
}
