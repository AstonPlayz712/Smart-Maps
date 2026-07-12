import 'package:riverpod/riverpod.dart';

enum SettingsPage {
  root,
  profile,
  mapStyle,
  notifications,
  sonicPreferences,
  compliance,
  about,
  privacyPolicy,
  accessibility,
}

class SettingsDepthStack extends StateNotifier<List<SettingsPage>> {
  SettingsDepthStack() : super(const [SettingsPage.root]);

  SettingsPage get currentPage => state.last;

  bool get canPop => state.length > 1;

  int get depth => state.length;

  void push(SettingsPage page) {
    if (state.length >= 5) {
      throw StateError('Settings stack maximum depth of 5 exceeded.');
    }
    state = List<SettingsPage>.unmodifiable([...state, page]);
  }

  SettingsPage? pop() {
    if (!canPop) {
      return null;
    }
    final popped = state.last;
    state = List<SettingsPage>.unmodifiable(state.sublist(0, state.length - 1));
    return popped;
  }

  void popToRoot() {
    state = const [SettingsPage.root];
  }
}
