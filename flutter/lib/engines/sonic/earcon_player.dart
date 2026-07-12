import 'dart:developer' as developer;

class EarconAsset {
  static const String junction = 'assets/audio/earcon_junction.mp3';
  static const String arrival = 'assets/audio/earcon_arrival.mp3';
  static const String reroute = 'assets/audio/earcon_reroute.mp3';
  static const String disruption = 'assets/audio/earcon_disruption.mp3';
  static const String wakeWord = 'assets/audio/earcon_wake.mp3';
}

class EarconPlayer {
  bool _isEnabled = true;
  double _volume = 1.0;

  void play(String assetPath, {double? panAngle}) {
    if (!_isEnabled) {
      return;
    }
    developer.log(
      'Earcon play: asset=$assetPath pan=${panAngle?.toStringAsFixed(2) ?? '0.00'} volume=${_volume.toStringAsFixed(2)}',
      name: 'EarconPlayer',
    );
    // Integration point: trigger audioplayers playback for assetPath with panAngle and _volume.
  }

  void setEnabled(bool v) {
    _isEnabled = v;
  }

  void setVolume(double v) {
    _volume = v.clamp(0.0, 1.0).toDouble();
  }

  void dispose() {}
}
