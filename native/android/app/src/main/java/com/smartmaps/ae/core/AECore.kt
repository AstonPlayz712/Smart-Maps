package com.smartmaps.ae.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * AECore — the A/E All-In-One orchestrator.
 *
 * Owns every engine and drives one dynamic tick loop. Engines only ever meet
 * here; they never call each other. Modules activate purely by having data —
 * no modes, no configuration, no fallback logic. UI observes the StateFlows;
 * it never reaches into an engine.
 *
 * Tick pipeline (every [tickMs]):
 *   1. movement  ← IMU window (+ GNSS speed as corroboration)
 *   2. fused fix ← inverse-variance fusion of all fresh sources, IMU-gated
 *   3. snap      ← road graph projection with hysteretic lock
 *   4. DR        ← when no fresh fix: advance along the snapped edge
 *   5. route     ← live remaining distance / ETA / next instruction
 *   6. transit   ← provider board refresh around the fused position
 */
class AECore(
    private val cache: OfflineGeometryCache,
    private val scope: CoroutineScope,
    private val tickMs: Long = 200L,
    private val now: () -> Long = System::currentTimeMillis
) {
    val fusion = LocationFusionEngine()
    val movement = MovementEngine()
    val spatial = SpatialEngine()
    val deadReckoning = DeadReckoningEngine()
    val routing = RoutingEngine()
    val transport = TransportTimeEngine()

    // ── observable state (UI binds to these) ────────────────────────────────
    private val _fix = MutableStateFlow<FusedFix?>(null)
    val fix: StateFlow<FusedFix?> = _fix.asStateFlow()

    private val _snap = MutableStateFlow<SnapResult?>(null)
    val snap: StateFlow<SnapResult?> = _snap.asStateFlow()

    private val _movementState = MutableStateFlow(MovementEstimate(MotionState.UNKNOWN, 0.0, 0.0, 0L))
    val movementState: StateFlow<MovementEstimate> = _movementState.asStateFlow()

    private val _route = MutableStateFlow<Route?>(null)
    val route: StateFlow<Route?> = _route.asStateFlow()

    private val _nextStep = MutableStateFlow<RouteStep?>(null)
    val nextStep: StateFlow<RouteStep?> = _nextStep.asStateFlow()

    private val _remaining = MutableStateFlow(Pair(0.0, 0.0)) // (distM, etaS)
    val remaining: StateFlow<Pair<Double, Double>> = _remaining.asStateFlow()

    private val _arrivals = MutableStateFlow<List<TransitArrival>>(emptyList())
    val arrivals: StateFlow<List<TransitArrival>> = _arrivals.asStateFlow()

    private var loop: Job? = null
    private var lastTickMs = 0L
    private var lastGoodFixMs = 0L

    // ── lifecycle ───────────────────────────────────────────────────────────

    /** Load the freshest cached graph (if any) and start the tick loop. */
    fun start(graphKey: String = "default") {
        if (loop != null) return
        cache.load(graphKey)?.let { spatial.setGraph(it) }
        lastTickMs = now()
        loop = scope.launch {
            while (true) {
                tick()
                delay(tickMs)
            }
        }
    }

    fun stop() {
        loop?.cancel()
        loop = null
    }

    /** Install a road graph (e.g. freshly downloaded) — write-through cache. */
    fun installGraph(key: String, graph: RoadGraph) {
        cache.save(key, graph)
        spatial.setGraph(graph)
    }

    // ── sensor feeds (SensorHub pushes here) ────────────────────────────────

    fun pushFix(fix: RawFix) = fusion.ingest(fix)

    fun pushMotion(sample: MotionSample) = movement.push(sample)

    // ── routing ─────────────────────────────────────────────────────────────

    /** Compute and activate a route from the current position (or [fromOverride]). */
    fun navigateTo(destination: GeoPoint, fromOverride: GeoPoint? = null): Route? {
        val from = fromOverride ?: _snap.value?.point ?: _fix.value?.point ?: return null
        val computed = routing.route(spatial.graph(), from, destination)
        _route.value = computed
        return computed
    }

    fun clearRoute() {
        _route.value = null
        _nextStep.value = null
        _remaining.value = 0.0 to 0.0
    }

    // ── the tick ────────────────────────────────────────────────────────────

    private fun tick() {
        val nowMs = now()
        val dtMs = (nowMs - lastTickMs).coerceIn(1L, 2000L)
        lastTickMs = nowMs

        // 1. movement from IMU (+ GNSS speed corroboration)
        val gnssSpeed = _fix.value?.takeIf { nowMs - it.timestampMs < 3000 }?.speedMps
        val move = movement.update(nowMs, gnssSpeed, dtMs)
        _movementState.value = move

        // 2. fuse all fresh location sources
        val fused = fusion.fuse(nowMs, move, dtMs)

        // 3–4. snap to road geometry, or dead-reckon through the outage
        if (fused != null) {
            val snapped = spatial.snap(fused, dtMs)
            if (fused.sources.isNotEmpty() && fused.timestampMs > lastGoodFixMs) {
                lastGoodFixMs = fused.timestampMs
            }
            val stale = nowMs - lastGoodFixMs > 3000
            if (!stale && snapped != null) {
                _snap.value = snapped
                _fix.value = fused.copy(
                    point = snapped.point,
                    headingDeg = spatial.alignedHeading(fused, snapped)
                )
                deadReckoning.seed(fused.speedMps, fused.headingDeg)
            } else {
                // 4. outage: advance along the last snapped edge, IMU-decayed
                val dr = deadReckoning.advance(spatial, _snap.value, move.imuActivity, dtMs)
                if (dr != null) {
                    _snap.value = dr
                    _fix.value = FusedFix(
                        point = dr.point,
                        accuracyM = (_fix.value?.accuracyM ?: 20.0) + 0.5 * (dtMs / 1000.0),
                        speedMps = deadReckoning.currentSpeedMps(),
                        headingDeg = dr.headingDeg,
                        sources = setOf(FixSource.DEAD_RECKONING),
                        timestampMs = nowMs
                    )
                } else if (fused.sources.isNotEmpty()) {
                    _fix.value = fused
                    if (snapped != null) _snap.value = snapped
                }
            }
        }

        // 5. live route progress
        val activeRoute = _route.value
        val position = _fix.value?.point
        if (activeRoute != null && position != null) {
            _remaining.value = routing.remaining(activeRoute, position)
            _nextStep.value = routing.nextStep(activeRoute, position)
            // Automatic arrival: within 25 m of the end with the route nearly
            // consumed → the route clears itself. Dynamic, no confirm dialogs.
            val end = activeRoute.points.lastOrNull()
            if (end != null && haversineM(position, end) < 25.0 && _remaining.value.first < 40.0) {
                clearRoute()
            }
        }

        // 6. transit board around the live position
        if (position != null) {
            transport.refresh(position, nowMs)
            _arrivals.value = transport.allArrivals()
        }
    }
}
