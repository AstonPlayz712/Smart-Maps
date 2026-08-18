package com.smartmaps.ae.core

/**
 * A/E Transport Time Engine — bus/train/tube arrival feeds.
 *
 * Providers register themselves and are polled by AECore's tick; whatever
 * they return is merged into one arrivals board keyed by stop. A provider
 * that is unreachable simply contributes nothing this tick — absence of live
 * data is shown as absence (timetable rows carry live=false), never faked.
 * No fallback ladders: the board is exactly the union of what providers know.
 */
interface TransportFeedProvider {
    val id: String
    val modes: Set<TransportMode>

    /** Stops near [center] within [radiusM] this provider knows about. */
    fun stopsNear(center: GeoPoint, radiusM: Double): List<TransitStop>

    /** Current arrivals for a stop. Empty when the provider has nothing. */
    fun arrivals(stopId: String, nowMs: Long): List<TransitArrival>
}

class TransportTimeEngine {

    private val providers = mutableListOf<TransportFeedProvider>()
    private var board: Map<String, List<TransitArrival>> = emptyMap()
    private var stops: List<TransitStop> = emptyList()
    private var lastRefreshMs = 0L
    private val refreshIntervalMs = 15_000L

    fun register(provider: TransportFeedProvider) {
        if (providers.none { it.id == provider.id }) providers.add(provider)
    }

    fun stops(): List<TransitStop> = stops

    fun arrivalsFor(stopId: String): List<TransitArrival> = board[stopId] ?: emptyList()

    /** All arrivals across nearby stops, soonest first. */
    fun allArrivals(): List<TransitArrival> =
        board.values.flatten().sortedBy { it.expectedAtMs }

    /**
     * Refresh the board around [center]. Rate-limited internally; callers can
     * invoke every tick. Providers that throw are skipped this cycle —
     * their data is simply absent until they recover.
     */
    fun refresh(center: GeoPoint, nowMs: Long, radiusM: Double = 800.0) {
        if (nowMs - lastRefreshMs < refreshIntervalMs && board.isNotEmpty()) return
        lastRefreshMs = nowMs

        val allStops = mutableListOf<TransitStop>()
        val newBoard = mutableMapOf<String, MutableList<TransitArrival>>()
        for (provider in providers) {
            val providerStops = runCatching { provider.stopsNear(center, radiusM) }.getOrDefault(emptyList())
            for (stop in providerStops) {
                if (allStops.none { it.id == stop.id }) allStops.add(stop)
                val arrivals = runCatching { provider.arrivals(stop.id, nowMs) }.getOrDefault(emptyList())
                newBoard.getOrPut(stop.id) { mutableListOf() }.addAll(arrivals)
            }
        }
        newBoard.values.forEach { it.sortBy { a -> a.expectedAtMs } }
        stops = allStops.sortedBy { haversineM(center, it.point) }
        board = newBoard
    }

    fun reset() {
        board = emptyMap()
        stops = emptyList()
        lastRefreshMs = 0
    }
}
