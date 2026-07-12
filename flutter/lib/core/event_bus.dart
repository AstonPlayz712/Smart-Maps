import 'dart:async';
import '../models/latlng.dart';
import '../models/camera_pose.dart';
import '../models/route_filament.dart';
import '../models/disruption_node.dart';
import '../models/movement_state.dart';
import '../models/place_node.dart';

// ─── Base event ──────────────────────────────────────────────────────────────

abstract class SmEvent {
  const SmEvent();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

class SmReadyEvent extends SmEvent {
  const SmReadyEvent();
}

class SmToastEvent extends SmEvent {
  final String message;
  const SmToastEvent(this.message);
}

// ─── Route events ─────────────────────────────────────────────────────────────

class RouteStartEvent extends SmEvent {
  final LatLng from;
  final LatLng to;
  const RouteStartEvent(this.from, this.to);
}

class RouteDoneEvent extends SmEvent {
  final double distanceMeters;
  final double durationSec;
  const RouteDoneEvent(this.distanceMeters, this.durationSec);
}

class RouteClearEvent extends SmEvent {
  const RouteClearEvent();
}

// ─── Camera ───────────────────────────────────────────────────────────────────

class CameraMoveEvent extends SmEvent {
  final CameraPose pose;
  const CameraMoveEvent(this.pose);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

class NavigationStartedEvent extends SmEvent {
  final LatLng destination;
  const NavigationStartedEvent(this.destination);
}

class NavigationStoppedEvent extends SmEvent {
  const NavigationStoppedEvent();
}

class NavigationArrivedEvent extends SmEvent {
  final PlaceNode destination;
  const NavigationArrivedEvent(this.destination);
}

// ─── Immersive Navigation (IN) ────────────────────────────────────────────────

class INEnterEvent extends SmEvent {
  final LatLng destination;
  const INEnterEvent(this.destination);
}

class INExitEvent extends SmEvent {
  const INExitEvent();
}

class INJunctionEvent extends SmEvent {
  final bool entering;
  final double distanceMeters;
  const INJunctionEvent(this.entering, this.distanceMeters);
}

// ─── Disruption ───────────────────────────────────────────────────────────────

class DisruptionDetectedEvent extends SmEvent {
  final DisruptionNode disruption;
  const DisruptionDetectedEvent(this.disruption);
}

class DisruptionClearedEvent extends SmEvent {
  final String id;
  const DisruptionClearedEvent(this.id);
}

class RerouteEvent extends SmEvent {
  final RouteFilament newFilament;
  const RerouteEvent(this.newFilament);
}

// ─── Sonic ────────────────────────────────────────────────────────────────────

class VoiceSpeakStartEvent extends SmEvent {
  final String text;
  const VoiceSpeakStartEvent(this.text);
}

class VoiceSpeakEndEvent extends SmEvent {
  const VoiceSpeakEndEvent();
}

// ─── Sensor / fusion ──────────────────────────────────────────────────────────

class SensorUpdateEvent extends SmEvent {
  final MovementState state;
  const SensorUpdateEvent(this.state);
}

// ─── EventBus ─────────────────────────────────────────────────────────────────

/// Typed in-process event bus.  Publish with [emit], subscribe with [on].
///
/// Each distinct event type gets its own broadcast [StreamController] so
/// subscribers pay nothing for events they haven't requested.
class EventBus<T extends Object> {
  final Map<Type, StreamController<dynamic>> _controllers = {};

  /// Emit an event of type [E] to all current subscribers.
  void emit<E extends T>(E event) {
    _controllerFor<E>().add(event);
  }

  /// Subscribe to events of type [E].  Returns a broadcast [Stream].
  Stream<E> on<E extends T>() => _controllerFor<E>().stream as Stream<E>;

  StreamController<E> _controllerFor<E>() {
    return (_controllers[E] ??= StreamController<E>.broadcast())
        as StreamController<E>;
  }

  /// Close all underlying stream controllers.
  void dispose() {
    for (final c in _controllers.values) {
      c.close();
    }
    _controllers.clear();
  }
}
