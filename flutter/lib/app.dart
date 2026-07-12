import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'main.dart';
import 'state_machines/app_state_machine.dart';
import 'core/smart_maps_engine.dart';
import 'platform/platform_config.dart';

// ─── App state provider ──────────────────────────────────────────────────────

/// Exposes the current [AppState] from the engine's [AppStateMachine].
final appStateProvider = StreamProvider<AppState>((ref) {
  final engine = ref.watch(smartMapsEngineProvider);
  return engine.appState.stream;
});

// ─── SmartMapsApp ─────────────────────────────────────────────────────────────

/// Root widget.  Wraps everything in [MaterialApp] with no custom theme
/// (design-layer concern) and mounts the persistent map surface shell.
class SmartMapsApp extends StatelessWidget {
  const SmartMapsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Smart Maps',
      debugShowCheckedModeBanner: false,
      // Theme is intentionally minimal — design layer is out of scope.
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1565C0)),
        useMaterial3: true,
      ),
      home: const SmartMapsShell(),
    );
  }
}

// ─── SmartMapsShell ───────────────────────────────────────────────────────────

/// The persistent map surface shell.
///
/// All UI states (Home, Explore, Navigation, IN, etc.) are overlays on top of
/// this single surface.  The map is never popped off the stack.
///
/// Design note: This widget is intentionally unstyled.  The [Container] below
/// represents the map surface integration point where [MapboxService] renders
/// the tile map.  Replace the placeholder with the real Mapbox widget when the
/// UI layer is built.
class SmartMapsShell extends ConsumerWidget {
  const SmartMapsShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appStateAsync = ref.watch(appStateProvider);
    final engine = ref.watch(smartMapsEngineProvider);

    return Scaffold(
      body: Stack(
        children: [
          // ── Persistent map surface ────────────────────────────────────────
          // Integration point: replace with MapboxMap widget.
          // Example:
          //   MapboxMap(
          //     accessToken: engine.mapboxService._accessToken,
          //     onMapCreated: (controller) => engine.mapboxService.setController(controller),
          //   )
          Container(
            color: const Color(0xFFE8EDF0),
            child: const Center(
              child: Text(
                'Map Surface\n(Mapbox integration point)',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF546E7A)),
              ),
            ),
          ),

          // ── State overlay ─────────────────────────────────────────────────
          // Each AppState maps to a different overlay widget.
          // Design is out of scope; this is just the state-driven switcher.
          appStateAsync.when(
            data: (state) => _StateOverlay(state: state, engine: engine),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

// ─── _StateOverlay ────────────────────────────────────────────────────────────

/// Routes [AppState] values to overlay widgets.
///
/// All overlays are transparent/minimal until the UI design layer is applied.
class _StateOverlay extends StatelessWidget {
  final AppState state;
  final SmartMapsEngine engine;

  const _StateOverlay({required this.state, required this.engine});

  @override
  Widget build(BuildContext context) {
    // View-only platforms suppress navigation overlays entirely.
    if (PlatformConfig.isViewOnly && _isNavigationState(state)) {
      return const SizedBox.shrink();
    }

    // State → overlay mapping.  Replace each child with a real overlay widget
    // in the UI layer.
    return switch (state) {
      AppState.rest => const SizedBox.shrink(),
      AppState.home => const _PlaceholderOverlay(name: 'Home'),
      AppState.explore => const _PlaceholderOverlay(name: 'Explore'),
      AppState.transit => const _PlaceholderOverlay(name: 'Transit'),
      AppState.saved => const _PlaceholderOverlay(name: 'Saved'),
      AppState.compose => const _PlaceholderOverlay(name: 'Compose'),
      AppState.navigation => const _PlaceholderOverlay(name: 'Navigation'),
      AppState.immersiveNavigation =>
        const _PlaceholderOverlay(name: 'Immersive Navigation'),
      AppState.disruption => const _PlaceholderOverlay(name: 'Disruption'),
      AppState.arrival => const _PlaceholderOverlay(name: 'Arrival'),
      AppState.settings => const _PlaceholderOverlay(name: 'Settings'),
    };
  }

  bool _isNavigationState(AppState s) =>
      s == AppState.navigation ||
      s == AppState.immersiveNavigation ||
      s == AppState.disruption ||
      s == AppState.arrival;
}

// ─── _PlaceholderOverlay ─────────────────────────────────────────────────────

/// Minimal overlay stub — replaced by real design in the UI layer.
class _PlaceholderOverlay extends StatelessWidget {
  final String name;

  const _PlaceholderOverlay({required this.name});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            name,
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ),
      ),
    );
  }
}
