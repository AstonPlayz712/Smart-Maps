import 'package:riverpod/riverpod.dart';

enum AppState {
  rest,
  home,
  explore,
  transit,
  saved,
  compose,
  navigation,
  immersiveNavigation,
  disruption,
  arrival,
  settings,
}

class AppStateMachine extends StateNotifier<AppState> {
  AppStateMachine() : super(AppState.rest);

  AppState? _previousState;

  static const Map<AppState, Set<AppState>> _validTransitions = {
    AppState.rest: {AppState.home},
    AppState.home: {
      AppState.explore,
      AppState.transit,
      AppState.saved,
      AppState.compose,
      AppState.navigation,
      AppState.settings,
    },
    AppState.explore: {AppState.home, AppState.navigation},
    AppState.transit: {AppState.home, AppState.navigation},
    AppState.saved: {AppState.home},
    AppState.compose: {AppState.home},
    AppState.navigation: {
      AppState.immersiveNavigation,
      AppState.disruption,
      AppState.arrival,
      AppState.home,
    },
    AppState.immersiveNavigation: {
      AppState.navigation,
      AppState.disruption,
      AppState.arrival,
      AppState.home,
    },
    AppState.disruption: {
      AppState.navigation,
      AppState.immersiveNavigation,
      AppState.home,
    },
    AppState.arrival: {AppState.home},
    AppState.settings: {AppState.home, AppState.navigation},
  };

  AppState? get previousState => _previousState;

  bool canTransition(AppState next) {
    if (next == state) {
      return false;
    }
    final allowed = _validTransitions[state] ?? const <AppState>{};
    if (!allowed.contains(next)) {
      return false;
    }
    if (state == AppState.settings && next == AppState.navigation) {
      return _previousState == AppState.navigation ||
          _previousState == AppState.immersiveNavigation;
    }
    return true;
  }

  void transition(AppState next) {
    if (!canTransition(next)) {
      throw StateError('Invalid app state transition: $state -> $next');
    }
    _previousState = state;
    state = next;
  }

  void reset() {
    _previousState = state;
    state = AppState.rest;
  }
}
