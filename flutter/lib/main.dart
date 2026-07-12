import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/smart_maps_engine.dart';
import 'app.dart';

/// Global engine provider — single instance for the app lifetime.
final smartMapsEngineProvider = Provider<SmartMapsEngine>((ref) {
  final engine = SmartMapsEngine.create(
    mapboxToken: const String.fromEnvironment(
      'MAPBOX_TOKEN',
      defaultValue: '',
    ),
  );
  ref.onDispose(engine.dispose);
  return engine;
});

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Create the engine before the widget tree so it is ready on first render.
  final engine = SmartMapsEngine.create(
    mapboxToken: const String.fromEnvironment('MAPBOX_TOKEN', defaultValue: ''),
  );
  await engine.initialize();

  runApp(
    ProviderScope(
      overrides: [
        // Provide the pre-initialised engine to the widget tree.
        smartMapsEngineProvider.overrideWithValue(engine),
      ],
      child: const SmartMapsApp(),
    ),
  );
}
