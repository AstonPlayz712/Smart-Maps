import 'dart:async';

class MediaDucker {
  bool _isDucked = false;
  final double _duckLevel = 0.3;
  final double _restoreLevel = 1.0;
  final StreamController<bool> _duckStateStream = StreamController<bool>.broadcast();

  void duck() {
    if (_isDucked) {
      return;
    }
    _isDucked = true;
    _duckStateStream.add(true);
  }

  void unduck() {
    if (!_isDucked) {
      return;
    }
    _isDucked = false;
    _duckStateStream.add(false);
  }

  bool get isDucked => _isDucked;

  Stream<bool> get duckStateChanges => _duckStateStream.stream;

  double get duckLevel => _duckLevel;

  double get restoreLevel => _restoreLevel;

  void dispose() {
    _duckStateStream.close();
  }
}
